import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PlanBillingType, Prisma, SubscriptionStatus } from "@prisma/client";

import type { AuthUserResponse } from "../auth/auth.types";
import { DatabaseService } from "../database/database.service";
import { ApplePurchaseProvider } from "./apple-purchase.provider";
import { FAKE_PURCHASE_PRODUCTS, PAID_ENTITLEMENTS, getApplePurchaseProducts, getFakeProductDefinition, getGooglePurchaseProducts } from "./purchase-catalog";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import { GooglePurchaseProvider } from "./google-purchase.provider";
import type { SimulateFakePurchaseDto } from "./dto/simulate-fake-purchase.dto";
import type { VerifyPurchaseDto } from "./dto/verify-purchase.dto";
import type {
  NormalizedPurchaseEvent,
  PurchaseAccessResponse,
  PurchaseEnvironmentName,
  PurchaseProductDefinition,
  PurchaseProductResponse,
  PurchaseProviderName,
  PurchaseSimulationResponse,
} from "./purchase.types";

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{
  include: { plan: true };
}>;

@Injectable()
export class PurchaseApplicationService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(ApplePurchaseProvider) private readonly applePurchaseProvider: ApplePurchaseProvider,
    @Inject(FakePurchaseProvider) private readonly fakePurchaseProvider: FakePurchaseProvider,
    @Inject(GooglePurchaseProvider) private readonly googlePurchaseProvider: GooglePurchaseProvider,
  ) {}

  async listProducts(input: {
    platform?: "android" | "ios" | "web";
    provider?: PurchaseProviderName;
    userId: string;
  }): Promise<PurchaseProductResponse[]> {
    const provider = input.provider ?? "fake";

    if (provider === "fake") {
      await this.ensureFakeCatalogProducts();
      return this.fakePurchaseProvider.listProducts({
        platform: input.platform,
        userId: input.userId,
      });
    }

    if (provider === "apple") {
      await this.ensureAppleCatalogProducts();
      return this.applePurchaseProvider.listProducts({
        platform: input.platform,
        userId: input.userId,
      });
    }

    if (provider === "google") {
      await this.ensureGoogleCatalogProducts();
      return this.googlePurchaseProvider.listProducts({
        platform: input.platform,
        userId: input.userId,
      });
    }

    throw new BadRequestException("Purchase provider is not supported yet.");
  }

  async getCurrentAccess(userId: string): Promise<PurchaseAccessResponse> {
    const now = new Date();
    const activeEntitlements = await this.databaseService.userEntitlement.findMany({
      where: {
        userId,
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    const subscriptionEntitlement = activeEntitlements.find((entitlement) => entitlement.sourceType === "subscription");

    if (subscriptionEntitlement?.sourceId) {
      const subscription = await this.databaseService.subscription.findUnique({
        where: { id: subscriptionEntitlement.sourceId },
        include: { plan: true },
      });

      if (subscription) {
        const latestTransaction = await this.databaseService.purchaseTransaction.findFirst({
          where: {
            subscriptionId: subscription.id,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        return {
          currentPeriodEndsAt: subscription.currentPeriodEndsAt?.toISOString() ?? null,
          entitlements: this.getActiveEntitlementCodes(activeEntitlements),
          environment: latestTransaction?.environment,
          planCode: subscription.plan.code,
          provider: latestTransaction?.provider,
          subscriptionStatus: subscription.status,
        };
      }
    }

    const demoSubscription = await this.databaseService.subscription.findFirst({
      where: {
        userId,
        status: "active",
        plan: {
          code: "demo",
        },
      },
      include: {
        plan: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      currentPeriodEndsAt: demoSubscription?.currentPeriodEndsAt?.toISOString() ?? null,
      entitlements: this.getActiveEntitlementCodes(activeEntitlements),
      planCode: demoSubscription?.plan.code ?? "demo",
      subscriptionStatus: demoSubscription?.status ?? "active",
    };
  }

  async simulateFakePurchase(
    user: AuthUserResponse,
    input: SimulateFakePurchaseDto,
  ): Promise<PurchaseSimulationResponse> {
    this.ensureFakePurchasesAllowed(user);
    await this.ensureFakeCatalogProducts();

    const event = await this.fakePurchaseProvider.completePurchase({
      providerProductId: input.providerProductId,
      purchaseToken: input.purchaseToken,
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

    const access = await this.applyNormalizedEvent(event, user.id);

    return {
      ...access,
      purchaseResult: event.purchaseResult,
    };
  }

  async verifyPurchase(user: AuthUserResponse, input: VerifyPurchaseDto): Promise<PurchaseSimulationResponse> {
    if (input.provider === "google") {
      await this.ensureGoogleCatalogProducts();
      const event = await this.googlePurchaseProvider.completePurchase({
        providerProductId: input.productId,
        purchaseToken: input.purchaseToken,
        userId: user.id,
      });

      if (!event) {
        return {
          ...(await this.getCurrentAccess(user.id)),
          purchaseResult: "canceled_by_user",
        };
      }

      const access = await this.applyNormalizedEvent(event, user.id);

      return {
        ...access,
        purchaseResult: event.purchaseResult,
      };
    }

    await this.ensureAppleCatalogProducts();
    const event = await this.applePurchaseProvider.completePurchase({
      providerProductId: input.productId,
      purchaseToken: input.purchaseToken,
      transactionId: input.transactionId,
      userId: user.id,
    });

    if (!event) {
      return {
        ...(await this.getCurrentAccess(user.id)),
        purchaseResult: "canceled_by_user",
      };
    }

    const access = await this.applyNormalizedEvent(event, user.id);

    return {
      ...access,
      purchaseResult: event.purchaseResult,
    };
  }

  async applyNormalizedEvent(
    event: NormalizedPurchaseEvent,
    fallbackUserId?: string,
  ): Promise<PurchaseAccessResponse> {
    const existingTransaction = await this.findExistingTransaction(event);

    if (existingTransaction) {
      return this.getCurrentAccess(existingTransaction.userId);
    }

    const product = await this.findStoreProduct(event.provider, event.providerProductId);

    if (!product) {
      throw new BadRequestException("Unknown purchase product.");
    }

    const userId = await this.resolveEventUserId(event, fallbackUserId);

    if (!userId) {
      throw new BadRequestException("Unable to resolve purchase user.");
    }

    await this.databaseService.$transaction(async (tx) => {
      const existingSubscription = await this.findEventSubscription(tx, event, userId);
      const stateChange = this.buildSubscriptionStateChange(event, product.billingType, existingSubscription);
      let subscriptionId = existingSubscription?.id ?? null;

      if (stateChange.shouldCreateOrUpdateSubscription) {
        const subscriptionStatus = stateChange.subscriptionStatus;

        if (!subscriptionStatus) {
          throw new BadRequestException("Purchase event cannot create subscription state.");
        }

        let subscription: SubscriptionWithPlan;

        if (existingSubscription) {
          subscription = await tx.subscription.update({
            where: { id: existingSubscription.id },
            data: stateChange.subscriptionUpdate,
            include: { plan: true },
          });
        } else {
          subscription = await tx.subscription.create({
            data: {
              currentPeriodEndsAt: stateChange.subscriptionUpdate.currentPeriodEndsAt,
              canceledAt: stateChange.subscriptionUpdate.canceledAt,
              planId: product.planId,
              startedAt: stateChange.subscriptionCreateStartedAt,
              status: subscriptionStatus,
              userId,
            },
            include: { plan: true },
          });
        }

        subscriptionId = subscription.id;
        await this.applyEntitlementState(tx, userId, subscription, stateChange.entitlementActive, stateChange.revokedAt);
      }

      await tx.purchaseTransaction.create({
        data: {
          environment: event.environment,
          eventType: event.eventType,
          expiresAt: this.parseOptionalDate(event.expiresAt),
          idempotencyKey: event.idempotencyKey,
          internalProductCode: product.internalProductCode,
          processedAt: new Date(),
          provider: event.provider,
          providerOriginalTransactionId: event.providerOriginalTransactionId ?? null,
          providerProductId: event.providerProductId,
          providerTransactionId: event.providerTransactionId,
          purchaseResult: event.purchaseResult,
          purchasedAt: this.parseOptionalDate(event.purchasedAt),
          rawPayloadJson: event.rawPayload as Prisma.InputJsonValue,
          revokedAt: this.parseOptionalDate(event.revokedAt),
          subscriptionId,
          subscriptionStatusAfterEvent: stateChange.subscriptionStatusAfterEvent,
          userId,
        },
      });
    });

    return this.getCurrentAccess(userId);
  }

  private ensureFakePurchasesAllowed(user: AuthUserResponse) {
    if (process.env.ENABLE_FAKE_PURCHASES !== "true") {
      throw new ServiceUnavailableException("Fake purchases are disabled.");
    }

    const environment = this.getPurchaseEnvironment();
    const productionAllowsFake = process.env.ALLOW_FAKE_PURCHASES_IN_PRODUCTION === "true";

    if (environment === "production" && !productionAllowsFake) {
      throw new ForbiddenException("Fake purchases are not allowed in production.");
    }

    if (process.env.ALLOW_FAKE_PURCHASES_FOR_ALL === "true") {
      return;
    }

    if (user.role !== "admin" && user.role !== "test_user") {
      throw new ForbiddenException("Fake purchase simulation requires test access.");
    }
  }

  private async ensureFakeCatalogProducts() {
    await this.databaseService.$transaction(async (tx) => {
      for (const product of FAKE_PURCHASE_PRODUCTS) {
        await this.upsertCatalogProduct(tx, product);
      }
    });
  }

  private async ensureAppleCatalogProducts() {
    await this.databaseService.$transaction(async (tx) => {
      for (const product of getApplePurchaseProducts()) {
        await this.upsertCatalogProduct(tx, product);
      }
    });
  }

  private async ensureGoogleCatalogProducts() {
    await this.databaseService.$transaction(async (tx) => {
      for (const product of getGooglePurchaseProducts()) {
        await this.upsertCatalogProduct(tx, product);
      }
    });
  }

  private async upsertCatalogProduct(transaction: Prisma.TransactionClient, product: PurchaseProductDefinition) {
    const plan = await transaction.plan.upsert({
      where: { code: product.planCode },
      create: {
        billingType: product.billingType,
        code: product.planCode,
        name: product.name,
      },
      update: {
        billingType: product.billingType,
        name: product.name,
      },
    });

    await transaction.storeProduct.upsert({
      where: {
        provider_providerProductId: {
          provider: product.provider,
          providerProductId: product.providerProductId,
        },
      },
      create: {
        active: true,
        billingType: product.billingType,
        internalProductCode: product.internalProductCode,
        planId: plan.id,
        provider: product.provider,
        providerProductId: product.providerProductId,
      },
      update: {
        active: true,
        billingType: product.billingType,
        internalProductCode: product.internalProductCode,
        planId: plan.id,
      },
    });
  }

  private async findStoreProduct(provider: PurchaseProviderName, providerProductId: string) {
    if (provider === "fake" && getFakeProductDefinition(providerProductId)) {
      await this.ensureFakeCatalogProducts();
    }

    if (provider === "apple") {
      await this.ensureAppleCatalogProducts();
    }

    if (provider === "google") {
      await this.ensureGoogleCatalogProducts();
    }

    return this.databaseService.storeProduct.findUnique({
      where: {
        provider_providerProductId: {
          provider,
          providerProductId,
        },
      },
      include: {
        plan: true,
      },
    });
  }

  private async findExistingTransaction(event: NormalizedPurchaseEvent) {
    const byIdempotencyKey = await this.databaseService.purchaseTransaction.findUnique({
      where: { idempotencyKey: event.idempotencyKey },
    });

    if (byIdempotencyKey) {
      return byIdempotencyKey;
    }

    return this.databaseService.purchaseTransaction.findUnique({
      where: {
        provider_providerTransactionId: {
          provider: event.provider,
          providerTransactionId: event.providerTransactionId,
        },
      },
    });
  }

  private async resolveEventUserId(event: NormalizedPurchaseEvent, fallbackUserId?: string) {
    if (event.userId) {
      return event.userId;
    }

    if (fallbackUserId) {
      return fallbackUserId;
    }

    if (!event.providerOriginalTransactionId) {
      return null;
    }

    const previousTransaction = await this.databaseService.purchaseTransaction.findFirst({
      where: {
        provider: event.provider,
        providerOriginalTransactionId: event.providerOriginalTransactionId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return previousTransaction?.userId ?? null;
  }

  private async findEventSubscription(
    transaction: Prisma.TransactionClient,
    event: NormalizedPurchaseEvent,
    userId: string,
  ): Promise<SubscriptionWithPlan | null> {
    if (!event.providerOriginalTransactionId) {
      return null;
    }

    const previousTransaction = await transaction.purchaseTransaction.findFirst({
      where: {
        provider: event.provider,
        providerOriginalTransactionId: event.providerOriginalTransactionId,
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!previousTransaction?.subscriptionId) {
      return null;
    }

    return transaction.subscription.findUnique({
      where: { id: previousTransaction.subscriptionId },
      include: { plan: true },
    });
  }

  private buildSubscriptionStateChange(
    event: NormalizedPurchaseEvent,
    billingType: PlanBillingType,
    existingSubscription: SubscriptionWithPlan | null,
  ) {
    const now = new Date();
    const eventExpiresAt = this.parseOptionalDate(event.expiresAt);
    const revokedAt = this.parseOptionalDate(event.revokedAt) ?? now;

    if (event.eventType === "DECLINED" || event.eventType === "PENDING") {
      return {
        entitlementActive: false,
        revokedAt: null,
        shouldCreateOrUpdateSubscription: false,
        subscriptionCreateStartedAt: this.parseOptionalDate(event.purchasedAt) ?? now,
        subscriptionStatus: null,
        subscriptionStatusAfterEvent: null,
        subscriptionUpdate: {},
      };
    }

    if (event.eventType === "EXPIRED" || event.eventType === "REFUNDED" || event.eventType === "REVOKED") {
      return {
        entitlementActive: false,
        revokedAt,
        shouldCreateOrUpdateSubscription: true,
        subscriptionCreateStartedAt: this.parseOptionalDate(event.purchasedAt) ?? now,
        subscriptionStatus: "expired" as const,
        subscriptionStatusAfterEvent: "expired" as const,
        subscriptionUpdate: {
          canceledAt: event.eventType === "EXPIRED" ? existingSubscription?.canceledAt ?? null : revokedAt,
          currentPeriodEndsAt: eventExpiresAt ?? now,
          status: "expired" as const,
        },
      };
    }

    const subscriptionStatus: SubscriptionStatus = billingType === "lifetime" ? "lifetime" : "active";
    const currentPeriodEndsAt =
      billingType === "lifetime"
        ? null
        : event.eventType === "RENEWED"
          ? this.getRenewedPeriodEnd(existingSubscription, billingType, eventExpiresAt, now)
          : eventExpiresAt;

    if (event.eventType === "CANCELED") {
      return {
        entitlementActive: true,
        revokedAt: null,
        shouldCreateOrUpdateSubscription: true,
        subscriptionCreateStartedAt: this.parseOptionalDate(event.purchasedAt) ?? now,
        subscriptionStatus: "canceled" as const,
        subscriptionStatusAfterEvent: "canceled" as const,
        subscriptionUpdate: {
          canceledAt: now,
          currentPeriodEndsAt: eventExpiresAt ?? existingSubscription?.currentPeriodEndsAt ?? null,
          status: "canceled" as const,
        },
      };
    }

    return {
      entitlementActive: true,
      revokedAt: null,
      shouldCreateOrUpdateSubscription: true,
      subscriptionCreateStartedAt: this.parseOptionalDate(event.purchasedAt) ?? now,
      subscriptionStatus,
      subscriptionStatusAfterEvent: subscriptionStatus,
      subscriptionUpdate: {
        canceledAt: null,
        currentPeriodEndsAt,
        status: subscriptionStatus,
      },
    };
  }

  private async applyEntitlementState(
    transaction: Prisma.TransactionClient,
    userId: string,
    subscription: SubscriptionWithPlan,
    active: boolean,
    revokedAt: Date | null,
  ) {
    const now = new Date();
    const expiresAt = subscription.status === "lifetime" ? null : subscription.currentPeriodEndsAt;

    await transaction.userEntitlement.updateMany({
      where: {
        active: true,
        entitlementCode: {
          in: [...PAID_ENTITLEMENTS],
        },
        userId,
      },
      data: {
        active: false,
        revokedAt: revokedAt ?? now,
      },
    });

    if (!active) {
      await transaction.userEntitlement.updateMany({
        where: {
          sourceId: subscription.id,
          sourceType: "subscription",
          userId,
        },
        data: {
          active: false,
          expiresAt,
          revokedAt: revokedAt ?? now,
        },
      });
      return;
    }

    for (const entitlement of PAID_ENTITLEMENTS) {
      await transaction.userEntitlement.create({
        data: {
          active: true,
          entitlementCode: entitlement,
          expiresAt,
          sourceId: subscription.id,
          sourceType: "subscription",
          startsAt: subscription.startedAt,
          userId,
        },
      });
    }
  }

  private getRenewedPeriodEnd(
    existingSubscription: SubscriptionWithPlan | null,
    billingType: PlanBillingType,
    eventExpiresAt: Date | null,
    now: Date,
  ) {
    if (eventExpiresAt && (!existingSubscription?.currentPeriodEndsAt || eventExpiresAt > existingSubscription.currentPeriodEndsAt)) {
      return eventExpiresAt;
    }

    const renewedFrom =
      existingSubscription?.currentPeriodEndsAt && existingSubscription.currentPeriodEndsAt > now
        ? new Date(existingSubscription.currentPeriodEndsAt)
        : new Date(now);

    if (billingType === "yearly") {
      renewedFrom.setFullYear(renewedFrom.getFullYear() + 1);
      return renewedFrom;
    }

    renewedFrom.setMonth(renewedFrom.getMonth() + 1);
    return renewedFrom;
  }

  private parseOptionalDate(value: string | undefined) {
    return value ? new Date(value) : null;
  }

  private getPurchaseEnvironment(): PurchaseEnvironmentName {
    const configuredEnvironment = process.env.PURCHASE_ENVIRONMENT?.trim();

    if (
      configuredEnvironment === "local" ||
      configuredEnvironment === "sandbox" ||
      configuredEnvironment === "production"
    ) {
      return configuredEnvironment;
    }

    return "local";
  }

  private getActiveEntitlementCodes(entitlements: Array<{ entitlementCode: string }>) {
    return Array.from(new Set(entitlements.map((entitlement) => entitlement.entitlementCode))).sort();
  }
}
