import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AutoRenewStatus,
  Environment,
  NotificationTypeV2,
  Status,
  Subtype,
} from "@apple/app-store-server-library";
import { createHash } from "node:crypto";

import type { AuthenticatedUser } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { ApplePurchaseConfig } from "./apple-purchase.config";
import {
  APPLE_STORE_GATEWAY,
  type AppleStoreGateway,
  type VerifiedAppleNotification,
} from "./apple-store.gateway";
import { PurchaseApplicationService } from "./purchase-application.service";
import type {
  NormalizedPurchaseEvent,
  PurchaseEventType,
  PurchaseSubscriptionStatus,
} from "./purchase.types";

const SUPPORTED_TYPES = new Set<string>([
  NotificationTypeV2.SUBSCRIBED,
  NotificationTypeV2.DID_RENEW,
  NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
  NotificationTypeV2.DID_CHANGE_RENEWAL_PREF,
  NotificationTypeV2.DID_FAIL_TO_RENEW,
  NotificationTypeV2.EXPIRED,
  NotificationTypeV2.GRACE_PERIOD_EXPIRED,
  NotificationTypeV2.REFUND,
  NotificationTypeV2.REVOKE,
]);

@Injectable()
export class AppleNotificationService {
  private readonly logger = new Logger(AppleNotificationService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(ApplePurchaseConfig) private readonly config: ApplePurchaseConfig,
    @Inject(APPLE_STORE_GATEWAY) private readonly gateway: AppleStoreGateway,
  ) {}

  async handleSignedPayload(signedPayload: string) {
    if (!signedPayload?.trim()) throw new BadRequestException("signedPayload is required.");
    const payloadHash = createHash("sha256").update(signedPayload).digest("hex");
    let audit = await this.getOrCreateAudit(payloadHash, signedPayload);
    if (audit.processingStatus === "processed" || audit.processingStatus === "ignored") {
      return { duplicate: true, status: audit.processingStatus };
    }

    audit = await this.database.applePurchaseNotification.update({
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: null,
        processingStatus: "processing",
      },
      where: { id: audit.id },
    });

    try {
      const verified = await this.gateway.verifyNotification(signedPayload);
      const payload = verified.payload;
      if (payload.notificationUUID) {
        const notificationDuplicate = await this.database.applePurchaseNotification.findUnique({
          where: { notificationUuid: payload.notificationUUID },
        });
        if (notificationDuplicate && notificationDuplicate.id !== audit.id) {
          await this.database.applePurchaseNotification.update({
            data: {
              decodedPayload: payload as Prisma.InputJsonValue,
              environment: this.environmentName(verified.environment),
              lastError: `Duplicate of Apple notification ${payload.notificationUUID}.`,
              notificationType: payload.notificationType,
              processedAt: new Date(),
              processingStatus: "ignored",
              subtype: payload.subtype,
            },
            where: { id: audit.id },
          });
          return { duplicate: true, status: notificationDuplicate.processingStatus };
        }
      }
      await this.database.applePurchaseNotification.update({
        data: {
          decodedPayload: payload as Prisma.InputJsonValue,
          environment: this.environmentName(verified.environment),
          notificationType: payload.notificationType,
          notificationUuid: payload.notificationUUID,
          subtype: payload.subtype,
        },
        where: { id: audit.id },
      });

      if (payload.notificationType === NotificationTypeV2.TEST) {
        await this.markComplete(audit.id, "processed");
        return { duplicate: false, status: "processed", test: true };
      }

      if (!payload.notificationType || !SUPPORTED_TYPES.has(payload.notificationType)) {
        this.logger.warn(
          `Ignoring safely persisted Apple notification type ${payload.notificationType ?? "UNKNOWN"}.`,
        );
        await this.markComplete(audit.id, "ignored");
        return { duplicate: false, status: "ignored" };
      }

      const user = await this.resolveUser(verified);
      const event = this.toEvent(user.id, payloadHash, verified);
      await this.purchaseApplication.applyEvent(event);
      await this.database.applePurchaseNotification.update({
        data: {
          lastError: null,
          processedAt: new Date(),
          processingStatus: "processed",
          userId: user.id,
        },
        where: { id: audit.id },
      });
      return { duplicate: false, status: "processed" };
    } catch (error) {
      await this.database.applePurchaseNotification.update({
        data: {
          lastError: this.errorMessage(error),
          processingStatus: "failed",
        },
        where: { id: audit.id },
      });
      throw error;
    }
  }

  async recoverHistory(
    user: AuthenticatedUser,
    input: { endDate?: string; environment?: string; onlyFailures?: boolean; startDate?: string },
  ) {
    this.requireAdmin(user);
    const environment = this.parseEnvironment(input.environment);
    const endDate = input.endDate ? new Date(input.endDate) : new Date();
    const startDate = input.startDate
      ? new Date(input.startDate)
      : new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate >= endDate) {
      throw new BadRequestException("Invalid notification history date range.");
    }
    const payloads = await this.gateway.getNotificationHistory({
      endDate: endDate.getTime(),
      environment,
      onlyFailures: input.onlyFailures,
      startDate: startDate.getTime(),
    });
    return this.processPayloadBatch(payloads);
  }

  async reprocessFailed(user: AuthenticatedUser, limit = 50) {
    this.requireAdmin(user);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new BadRequestException("limit must be a positive integer.");
    }
    const records = await this.database.applePurchaseNotification.findMany({
      orderBy: { receivedAt: "asc" },
      select: { signedPayload: true },
      take: Math.min(Math.max(limit, 1), 200),
      where: { processingStatus: "failed" },
    });
    return this.processPayloadBatch(records.map((record) => record.signedPayload));
  }

  async requestTestNotification(user: AuthenticatedUser, environmentInput?: string) {
    this.requireAdmin(user);
    const environment = this.parseEnvironment(environmentInput);
    return { testNotificationToken: await this.gateway.requestTestNotification(environment) };
  }

  private async processPayloadBatch(payloads: string[]) {
    let failed = 0;
    let processed = 0;
    for (const payload of payloads) {
      try {
        await this.handleSignedPayload(payload);
        processed += 1;
      } catch (error) {
        failed += 1;
        this.logger.error(`Failed to recover Apple notification: ${this.errorMessage(error)}`);
      }
    }
    return { failed, processed, total: payloads.length };
  }

  private async getOrCreateAudit(payloadHash: string, signedPayload: string) {
    const existing = await this.database.applePurchaseNotification.findUnique({
      where: { payloadHash },
    });
    if (existing) return existing;
    try {
      return await this.database.applePurchaseNotification.create({
        data: { payloadHash, signedPayload },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.database.applePurchaseNotification.findUnique({
          where: { payloadHash },
        });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private async resolveUser(verified: VerifiedAppleNotification) {
    const transaction = verified.transaction;
    if (!transaction?.appAccountToken || !transaction.originalTransactionId) {
      throw new UnprocessableEntityException({
        code: "APPLE_ACCOUNT_TOKEN_MISMATCH",
        message: "Apple notification is missing Trailbook account binding.",
      });
    }
    const user = await this.database.user.findUnique({
      select: { appleAppAccountToken: true, id: true },
      where: { appleAppAccountToken: transaction.appAccountToken },
    });
    if (!user || user.appleAppAccountToken.toLowerCase() !== transaction.appAccountToken.toLowerCase()) {
      throw new UnprocessableEntityException({
        code: "APPLE_ACCOUNT_TOKEN_MISMATCH",
        message: "Apple notification is not linked to a Trailbook account.",
      });
    }
    if (
      verified.renewalInfo?.appAccountToken &&
      verified.renewalInfo.appAccountToken.toLowerCase() !== user.appleAppAccountToken.toLowerCase()
    ) {
      throw new UnprocessableEntityException({
        code: "APPLE_ACCOUNT_TOKEN_MISMATCH",
        message: "Apple renewal information has a different account token.",
      });
    }
    return user;
  }

  private toEvent(
    userId: string,
    payloadHash: string,
    verified: VerifiedAppleNotification,
  ): NormalizedPurchaseEvent {
    const payload = verified.payload;
    const transaction = verified.transaction;
    if (!transaction) throw this.invalidNotification("Missing signed transaction information.");
    if (transaction.bundleId !== this.config.bundleId) {
      throw this.invalidNotification("Apple notification bundle does not match Trailbook.");
    }
    if (!transaction.productId || !this.config.productIds.has(transaction.productId)) {
      throw new UnprocessableEntityException({
        code: "APPLE_PRODUCT_NOT_ALLOWED",
        message: "Apple notification contains an unsupported product.",
      });
    }
    const transactionId = this.requireTransactionValue(transaction.transactionId, "transactionId");
    const originalTransactionId = this.requireTransactionValue(
      transaction.originalTransactionId,
      "originalTransactionId",
    );
    const autoRenewEnabled = verified.renewalInfo?.autoRenewStatus === AutoRenewStatus.ON;
    const state = this.notificationState(payload.notificationType!, payload.subtype, payload.data?.status);
    const revoked = Boolean(transaction.revocationDate) || state.status === "revoked";
    const expiresAt =
      state.status === "in_grace_period"
        ? verified.renewalInfo?.gracePeriodExpiresDate
        : transaction.expiresDate;

    return {
      autoRenewEnabled,
      environment: this.environmentName(verified.environment),
      eventType: state.eventType === "REFUNDED" ? "REFUNDED" : revoked ? "REVOKED" : state.eventType,
      expiresAt: this.toIsoString(expiresAt),
      idempotencyKey: `apple:notification:${payload.notificationUUID ?? payloadHash}`,
      originalTransactionId,
      provider: "apple",
      providerProductId: transaction.productId,
      purchasedAt: this.toIsoString(transaction.purchaseDate),
      rawPayload: {
        notification: payload,
        renewalInfo: verified.renewalInfo,
        transaction,
      },
      result: "success",
      revokedAt: this.toIsoString(transaction.revocationDate),
      subscriptionStatus: revoked ? "revoked" : this.applyRenewalStatus(state.status, autoRenewEnabled),
      transactionId,
      userId,
      verifiedAt: this.toIsoString(payload.signedDate) ?? new Date().toISOString(),
    };
  }

  private notificationState(type: string, subtype: string | undefined, status: number | undefined) {
    if (type === NotificationTypeV2.REFUND) {
      return { eventType: "REFUNDED" as PurchaseEventType, status: "revoked" as PurchaseSubscriptionStatus };
    }
    if (type === NotificationTypeV2.REVOKE) {
      return { eventType: "REVOKED" as PurchaseEventType, status: "revoked" as PurchaseSubscriptionStatus };
    }
    if (type === NotificationTypeV2.EXPIRED || type === NotificationTypeV2.GRACE_PERIOD_EXPIRED) {
      return { eventType: "EXPIRED" as PurchaseEventType, status: "expired" as PurchaseSubscriptionStatus };
    }
    if (type === NotificationTypeV2.DID_FAIL_TO_RENEW) {
      return subtype === Subtype.GRACE_PERIOD
        ? { eventType: "RESTORED" as PurchaseEventType, status: "in_grace_period" as PurchaseSubscriptionStatus }
        : { eventType: "EXPIRED" as PurchaseEventType, status: "billing_retry" as PurchaseSubscriptionStatus };
    }
    if (status === Status.REVOKED) {
      return { eventType: "REVOKED" as PurchaseEventType, status: "revoked" as PurchaseSubscriptionStatus };
    }
    if (status === Status.EXPIRED) {
      return { eventType: "EXPIRED" as PurchaseEventType, status: "expired" as PurchaseSubscriptionStatus };
    }
    if (status === Status.BILLING_RETRY) {
      return { eventType: "EXPIRED" as PurchaseEventType, status: "billing_retry" as PurchaseSubscriptionStatus };
    }
    if (status === Status.BILLING_GRACE_PERIOD) {
      return { eventType: "RESTORED" as PurchaseEventType, status: "in_grace_period" as PurchaseSubscriptionStatus };
    }
    if (type === NotificationTypeV2.DID_RENEW) {
      return { eventType: "RENEWED" as PurchaseEventType, status: "active" as PurchaseSubscriptionStatus };
    }
    if (
      type === NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS &&
      subtype === Subtype.AUTO_RENEW_DISABLED
    ) {
      return { eventType: "CANCELED" as PurchaseEventType, status: "canceled" as PurchaseSubscriptionStatus };
    }
    return { eventType: "PURCHASED" as PurchaseEventType, status: "active" as PurchaseSubscriptionStatus };
  }

  private applyRenewalStatus(status: PurchaseSubscriptionStatus, autoRenewEnabled: boolean) {
    return status === "active" && !autoRenewEnabled ? "canceled" : status;
  }

  private async markComplete(id: string, status: "ignored" | "processed") {
    await this.database.applePurchaseNotification.update({
      data: { lastError: null, processedAt: new Date(), processingStatus: status },
      where: { id },
    });
  }

  private parseEnvironment(value?: string) {
    if (value === "production") return Environment.PRODUCTION;
    if (!value || value === "sandbox") return Environment.SANDBOX;
    throw new BadRequestException("environment must be sandbox or production.");
  }

  private environmentName(environment: Environment) {
    return environment === Environment.PRODUCTION ? "production" as const : "sandbox" as const;
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== "admin") throw new ForbiddenException("Admin access is required.");
  }

  private requireTransactionValue(value: string | undefined, field: string) {
    if (!value) throw this.invalidNotification(`Missing ${field}.`);
    return value;
  }

  private invalidNotification(message: string) {
    return new UnprocessableEntityException({ code: "APPLE_NOTIFICATION_INVALID", message });
  }

  private toIsoString(value: number | undefined) {
    return value === undefined ? undefined : new Date(value).toISOString();
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 4000) : "Unknown notification error";
  }
}
