import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import type { AuthenticatedUser } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { FAKE_PURCHASE_PRODUCTS, findFakePurchaseProduct } from "./purchase-catalog";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import type {
  FakePurchaseScenario,
  NormalizedPurchaseEvent,
  PurchaseAccessResponse,
  PurchaseSimulationResponse,
} from "./purchase.types";

const DEMO_ACCESS: PurchaseAccessResponse = {
  currentPeriodEndsAt: null,
  entitlements: [],
  planCode: "demo",
  subscriptionStatus: "active",
};

@Injectable()
export class PurchaseApplicationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(FakePurchaseProvider) private readonly fakeProvider: FakePurchaseProvider,
  ) {}

  listFakeProducts() {
    return FAKE_PURCHASE_PRODUCTS;
  }

  async getCurrentAccess(userId: string): Promise<PurchaseAccessResponse> {
    const access = await this.database.purchaseAccess.findUnique({ where: { userId } });
    if (!access) return DEMO_ACCESS;

    if (
      access.subscriptionStatus !== "lifetime" &&
      access.currentPeriodEndsAt &&
      access.currentPeriodEndsAt.getTime() <= Date.now() &&
      access.subscriptionStatus !== "expired"
    ) {
      await this.database.purchaseAccess.update({
        data: {
          entitlements: [],
          subscriptionStatus: "expired",
        },
        where: { userId },
      });
      return DEMO_ACCESS;
    }

    if (access.subscriptionStatus === "expired") return DEMO_ACCESS;

    return {
      currentPeriodEndsAt: access.currentPeriodEndsAt?.toISOString() ?? null,
      entitlements: this.parseEntitlements(access.entitlements),
      environment: this.parseEnvironment(access.environment),
      planCode: access.planCode,
      provider: this.parseProvider(access.provider),
      subscriptionStatus: this.parseStatus(access.subscriptionStatus),
    };
  }

  async simulateFakePurchase(
    user: AuthenticatedUser,
    input: {
      providerProductId?: string;
      scenario?: FakePurchaseScenario;
      transactionId?: string;
    },
  ): Promise<PurchaseSimulationResponse> {
    this.ensureFakePurchasesAllowed(user);
    if (!input.providerProductId) {
      throw new BadRequestException("providerProductId is required.");
    }

    const event = this.fakeProvider.completePurchase({
      productId: input.providerProductId,
      scenario: input.scenario,
      transactionId: input.transactionId,
      userId: user.id,
    });

    if (!event) {
      return {
        ...(await this.getCurrentAccess(user.id)),
        purchaseResult: "canceled_by_user",
      };
    }

    const access = await this.applyEvent(event);
    return { ...access, purchaseResult: event.result };
  }

  private async applyEvent(event: NormalizedPurchaseEvent): Promise<PurchaseAccessResponse> {
    const existing = await this.database.purchaseEvent.findFirst({
      where: {
        OR: [
          { idempotencyKey: event.idempotencyKey },
          { provider: event.provider, transactionId: event.transactionId },
        ],
      },
    });
    if (existing) return this.getCurrentAccess(existing.userId);

    const product = findFakePurchaseProduct(event.providerProductId);
    if (!product) throw new BadRequestException("Unknown purchase product.");

    await this.database.$transaction(async (tx) => {
      const current = await tx.purchaseAccess.findUnique({ where: { userId: event.userId } });
      const nextAccess = this.getNextAccess(current, event, product);

      if (nextAccess) {
        await tx.purchaseAccess.upsert({
          create: { userId: event.userId, ...nextAccess },
          update: nextAccess,
          where: { userId: event.userId },
        });
      }

      await tx.purchaseEvent.create({
        data: {
          environment: event.environment,
          eventType: event.eventType,
          expiresAt: this.parseDate(event.expiresAt),
          idempotencyKey: event.idempotencyKey,
          originalTransactionId: event.originalTransactionId,
          provider: event.provider,
          providerProductId: event.providerProductId,
          purchasedAt: this.parseDate(event.purchasedAt),
          rawPayload: event.rawPayload as Prisma.InputJsonValue,
          result: event.result,
          revokedAt: this.parseDate(event.revokedAt),
          transactionId: event.transactionId,
          userId: event.userId,
        },
      });
    });

    return this.getCurrentAccess(event.userId);
  }

  private getNextAccess(
    current: {
      currentPeriodEndsAt: Date | null;
      providerProductId: string | null;
    } | null,
    event: NormalizedPurchaseEvent,
    product: (typeof FAKE_PURCHASE_PRODUCTS)[number],
  ) {
    if (event.eventType === "DECLINED" || event.eventType === "PENDING") return null;

    if (
      event.eventType === "EXPIRED" ||
      event.eventType === "REFUNDED" ||
      event.eventType === "REVOKED"
    ) {
      return {
        currentPeriodEndsAt: this.parseDate(event.expiresAt) ?? new Date(),
        entitlements: [],
        environment: event.environment,
        originalTransactionId: event.originalTransactionId,
        planCode: product.planCode,
        provider: event.provider,
        providerProductId: event.providerProductId,
        subscriptionStatus: "expired",
      };
    }

    const isLifetime = product.billingType === "lifetime";
    let currentPeriodEndsAt = isLifetime ? null : this.parseDate(event.expiresAt);

    if (
      event.eventType === "RENEWED" &&
      current?.providerProductId === event.providerProductId &&
      current.currentPeriodEndsAt
    ) {
      const renewedFrom = new Date(Math.max(current.currentPeriodEndsAt.getTime(), Date.now()));
      if (product.billingType === "yearly") {
        renewedFrom.setFullYear(renewedFrom.getFullYear() + 1);
      } else {
        renewedFrom.setMonth(renewedFrom.getMonth() + 1);
      }
      currentPeriodEndsAt = renewedFrom;
    }

    if (
      event.eventType === "CANCELED" &&
      current?.providerProductId === event.providerProductId &&
      current.currentPeriodEndsAt &&
      (!currentPeriodEndsAt || current.currentPeriodEndsAt > currentPeriodEndsAt)
    ) {
      currentPeriodEndsAt = current.currentPeriodEndsAt;
    }

    return {
      currentPeriodEndsAt,
      entitlements: product.entitlements,
      environment: event.environment,
      originalTransactionId: event.originalTransactionId,
      planCode: product.planCode,
      provider: event.provider,
      providerProductId: event.providerProductId,
      subscriptionStatus:
        event.eventType === "CANCELED"
          ? "canceled"
          : isLifetime
            ? "lifetime"
            : "active",
    };
  }

  private ensureFakePurchasesAllowed(user: AuthenticatedUser) {
    if (process.env.ENABLE_FAKE_PURCHASES !== "true") {
      throw new ServiceUnavailableException("Fake purchases are disabled.");
    }
    if (
      process.env.PURCHASE_ENVIRONMENT === "production" &&
      process.env.ALLOW_FAKE_PURCHASES_IN_PRODUCTION !== "true"
    ) {
      throw new ForbiddenException("Fake purchases are not allowed in production.");
    }
    if (
      process.env.ALLOW_FAKE_PURCHASES_FOR_ALL !== "true" &&
      user.role !== "admin" &&
      user.role !== "test_user"
    ) {
      throw new ForbiddenException("Fake purchase simulation requires test access.");
    }
  }

  private parseDate(value: string | undefined) {
    return value ? new Date(value) : null;
  }

  private parseEntitlements(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private parseEnvironment(value: string | null) {
    return value === "local" || value === "sandbox" || value === "production"
      ? value
      : undefined;
  }

  private parseProvider(value: string | null) {
    return value === "fake" || value === "apple" || value === "google" ? value : undefined;
  }

  private parseStatus(value: string) {
    if (value === "expired" || value === "canceled" || value === "lifetime") return value;
    return "active";
  }
}
