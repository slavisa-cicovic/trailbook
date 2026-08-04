import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import type { AuthenticatedUser } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { FAKE_PURCHASE_PRODUCTS, findPurchaseProduct } from "./purchase-catalog";
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
  private readonly logger = new Logger(PurchaseApplicationService.name);

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
      (access.subscriptionStatus === "active" ||
        access.subscriptionStatus === "canceled" ||
        access.subscriptionStatus === "in_grace_period") &&
      access.currentPeriodEndsAt &&
      access.currentPeriodEndsAt.getTime() <= Date.now()
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

  async requirePremium(user: AuthenticatedUser): Promise<void> {
    if (
      process.env.ENABLE_PURCHASE_TEST_ROLE_BYPASS === "true" &&
      (user.role === "admin" || user.role === "test_user")
    ) {
      this.logger.warn(`Premium entitlement bypass used by ${user.role} user ${user.id}.`);
      return;
    }

    const access = await this.getCurrentAccess(user.id);
    const validStatus =
      access.subscriptionStatus === "active" ||
      access.subscriptionStatus === "canceled" ||
      access.subscriptionStatus === "in_grace_period" ||
      access.subscriptionStatus === "lifetime";
    const periodIsValid =
      access.subscriptionStatus === "lifetime" ||
      Boolean(
        access.currentPeriodEndsAt &&
          new Date(access.currentPeriodEndsAt).getTime() > Date.now(),
      );
    if (
      access.planCode !== "demo" &&
      access.entitlements.length > 0 &&
      validStatus &&
      periodIsValid
    ) {
      return;
    }

    throw new ForbiddenException({
      code: "PREMIUM_ENTITLEMENT_REQUIRED",
      message: "An active Premium entitlement is required.",
    });
  }

  async getLocalTestTripAllowance(userId: string) {
    const user = await this.database.user.findUniqueOrThrow({
      select: {
        localTestTripClientId: true,
        localTestTripUsedAt: true,
      },
      where: { id: userId },
    });
    return {
      available: user.localTestTripUsedAt === null,
      tripClientId: user.localTestTripClientId,
      usedAt: user.localTestTripUsedAt?.toISOString() ?? null,
    };
  }

  async consumeLocalTestTripAllowance(userId: string, clientTripId: string) {
    const normalizedTripId = clientTripId.trim();
    if (!normalizedTripId) {
      throw new BadRequestException("clientTripId is required.");
    }

    const existing = await this.database.user.findUniqueOrThrow({
      select: {
        localTestTripClientId: true,
        localTestTripUsedAt: true,
      },
      where: { id: userId },
    });
    if (existing.localTestTripUsedAt) {
      if (existing.localTestTripClientId === normalizedTripId) {
        return {
          available: false,
          tripClientId: existing.localTestTripClientId,
          usedAt: existing.localTestTripUsedAt.toISOString(),
        };
      }
      throw new ForbiddenException({
        code: "LOCAL_TEST_TRIP_ALREADY_USED",
        message: "Premium is required to record another trip.",
      });
    }

    const usedAt = new Date();
    const claimed = await this.database.user.updateMany({
      data: {
        localTestTripClientId: normalizedTripId,
        localTestTripUsedAt: usedAt,
      },
      where: { id: userId, localTestTripUsedAt: null },
    });
    if (claimed.count === 0) {
      const winner = await this.database.user.findUniqueOrThrow({
        select: {
          localTestTripClientId: true,
          localTestTripUsedAt: true,
        },
        where: { id: userId },
      });
      if (
        winner.localTestTripClientId === normalizedTripId &&
        winner.localTestTripUsedAt
      ) {
        return {
          available: false,
          tripClientId: winner.localTestTripClientId,
          usedAt: winner.localTestTripUsedAt.toISOString(),
        };
      }
      throw new ForbiddenException({
        code: "LOCAL_TEST_TRIP_ALREADY_USED",
        message: "Premium is required to record another trip.",
      });
    }

    return {
      available: false,
      tripClientId: normalizedTripId,
      usedAt: usedAt.toISOString(),
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

  async applyEvent(event: NormalizedPurchaseEvent): Promise<PurchaseAccessResponse> {
    const existing = await this.database.purchaseEvent.findUnique({
      where: { idempotencyKey: event.idempotencyKey },
    });
    if (existing) {
      if (existing.userId !== event.userId) this.throwPurchaseOwnershipConflict(event.provider);
      return this.getCurrentAccess(existing.userId);
    }

    if (event.provider === "apple" || event.provider === "google") {
      const existingTransaction = await this.database.purchaseEvent.findFirst({
        select: { userId: true },
        where: {
          provider: event.provider,
          transactionId: event.transactionId,
        },
      });
      if (existingTransaction) {
        if (existingTransaction.userId !== event.userId) {
          this.throwPurchaseOwnershipConflict(event.provider);
        }
        // Lifecycle notifications can reuse the original purchase transaction
        // ID. Their notification UUID remains the idempotency boundary.
        if (event.eventType === "PURCHASED") {
          return this.getCurrentAccess(existingTransaction.userId);
        }
      }
    }

    if (
      (event.provider === "apple" || event.provider === "google") &&
      event.originalTransactionId
    ) {
      const owner = await this.database.purchaseEvent.findFirst({
        select: { userId: true },
        where: {
          originalTransactionId: event.originalTransactionId,
          provider: event.provider,
        },
      });
      if (owner && owner.userId !== event.userId) {
        this.throwPurchaseOwnershipConflict(event.provider);
      }
    }

    const product = findPurchaseProduct(
      event.providerProductId,
      event.provider,
      event.providerBasePlanId,
    );
    if (!product) throw new BadRequestException("Unknown purchase product.");

    try {
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
    } catch (error) {
      if (
        (event.provider === "apple" || event.provider === "google") &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingEvent = await this.database.purchaseEvent.findUnique({
          where: { idempotencyKey: event.idempotencyKey },
        });
        if (existingEvent) {
          if (existingEvent.userId !== event.userId) {
            this.throwPurchaseOwnershipConflict(event.provider);
          }
          return this.getCurrentAccess(existingEvent.userId);
        }
      }
      throw error;
    }

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
        autoRenewEnabled: event.autoRenewEnabled,
        currentPeriodEndsAt: this.parseDate(event.expiresAt) ?? new Date(),
        entitlements: [],
        environment: event.environment,
        originalTransactionId: event.originalTransactionId,
        planCode: product.planCode,
        provider: event.provider,
        providerProductId: event.providerProductId,
        revokedAt: this.parseDate(event.revokedAt),
        subscriptionStatus: event.subscriptionStatus ?? "expired",
        verifiedAt: this.parseDate(event.verifiedAt),
      };
    }

    const isLifetime = product.billingType === "lifetime";
    let currentPeriodEndsAt = isLifetime ? null : this.parseDate(event.expiresAt);

    if (
      event.eventType === "RENEWED" &&
      event.provider === "fake" &&
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
      autoRenewEnabled: event.autoRenewEnabled,
      currentPeriodEndsAt,
      entitlements: product.entitlements,
      environment: event.environment,
      originalTransactionId: event.originalTransactionId,
      planCode: product.planCode,
      provider: event.provider,
      providerProductId: event.providerProductId,
      revokedAt: this.parseDate(event.revokedAt),
      subscriptionStatus:
        event.subscriptionStatus ??
        (event.eventType === "CANCELED"
          ? "canceled"
          : isLifetime
            ? "lifetime"
            : "active"),
      verifiedAt: this.parseDate(event.verifiedAt),
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
    if (
      value === "billing_retry" ||
      value === "canceled" ||
      value === "expired" ||
      value === "in_grace_period" ||
      value === "lifetime" ||
      value === "revoked"
    ) {
      return value;
    }
    return "active";
  }

  private throwPurchaseOwnershipConflict(provider: "apple" | "google" | "fake"): never {
    const store = provider === "google" ? "Google Play" : "Apple";
    const code = provider === "google"
      ? "GOOGLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT"
      : "APPLE_PURCHASE_ALREADY_LINKED_TO_ANOTHER_ACCOUNT";
    throw new ConflictException({
      code,
      message: `This ${store} purchase is already linked to another Trailbook account.`,
    });
  }
}
