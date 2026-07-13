import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  AutoRenewStatus,
  Environment,
  Status,
  TransactionReason,
} from "@apple/app-store-server-library";

import { DatabaseService } from "../database/database.service";
import { PurchaseApplicationService } from "./purchase-application.service";
import { ApplePurchaseConfig } from "./apple-purchase.config";
import {
  APPLE_STORE_GATEWAY,
  type AppleStoreGateway,
  type VerifiedAppleSubscription,
} from "./apple-store.gateway";
import type {
  ApplePurchaseVerificationInput,
  NormalizedPurchaseEvent,
  PurchaseAccessResponse,
  PurchaseEventType,
  PurchaseSubscriptionStatus,
} from "./purchase.types";

@Injectable()
export class ApplePurchaseProvider {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(ApplePurchaseConfig) private readonly config: ApplePurchaseConfig,
    @Inject(APPLE_STORE_GATEWAY) private readonly gateway: AppleStoreGateway,
  ) {}

  async getAccountToken(userId: string) {
    const user = await this.database.user.findUnique({
      select: { appleAppAccountToken: true },
      where: { id: userId },
    });
    if (!user) throw new BadRequestException("Unknown Trailbook user.");
    return { appAccountToken: user.appleAppAccountToken };
  }

  async verifyPurchase(input: ApplePurchaseVerificationInput): Promise<PurchaseAccessResponse> {
    this.validateInput(input);
    const { appAccountToken } = await this.getAccountToken(input.userId);
    if (appAccountToken.toLowerCase() !== input.appAccountToken.toLowerCase()) {
      throw this.accountTokenMismatch();
    }

    const verified = await this.gateway.verifySubscription(input.transactionId);
    this.validateVerifiedPurchase(input, appAccountToken, verified);
    return this.purchaseApplication.applyEvent(this.toEvent(input.userId, verified));
  }

  private validateInput(input: ApplePurchaseVerificationInput) {
    if (!input.transactionId?.trim() || !input.productId?.trim() || !input.appAccountToken?.trim()) {
      throw new BadRequestException("transactionId, productId and appAccountToken are required.");
    }
    if (!this.isUuid(input.appAccountToken)) {
      throw new BadRequestException("appAccountToken must be a UUID.");
    }
    if (!this.config.productIds.has(input.productId)) {
      throw new UnprocessableEntityException({
        code: "APPLE_PRODUCT_NOT_ALLOWED",
        message: "Apple product is not configured for Trailbook Premium.",
      });
    }
  }

  private validateVerifiedPurchase(
    input: ApplePurchaseVerificationInput,
    accountToken: string,
    verified: VerifiedAppleSubscription,
  ) {
    const requested = verified.requestedTransaction;
    const current = verified.currentTransaction;
    if (requested.bundleId !== this.config.bundleId || current.bundleId !== this.config.bundleId) {
      throw new UnprocessableEntityException({
        code: "APPLE_BUNDLE_MISMATCH",
        message: "Apple transaction belongs to another application.",
      });
    }
    if (requested.transactionId !== input.transactionId) {
      throw new UnprocessableEntityException({
        code: "APPLE_TRANSACTION_INVALID",
        message: "Apple returned a different transaction identifier.",
      });
    }
    if (requested.productId !== input.productId || !current.productId || !this.config.productIds.has(current.productId)) {
      throw new UnprocessableEntityException({
        code: "APPLE_PRODUCT_NOT_ALLOWED",
        message: "Apple transaction product does not match an allowed product.",
      });
    }
    if (!requested.originalTransactionId || requested.originalTransactionId !== current.originalTransactionId) {
      throw new UnprocessableEntityException({
        code: "APPLE_TRANSACTION_INVALID",
        message: "Apple transaction chain is inconsistent.",
      });
    }
    if (
      requested.appAccountToken?.toLowerCase() !== accountToken.toLowerCase() ||
      current.appAccountToken?.toLowerCase() !== accountToken.toLowerCase()
    ) {
      throw this.accountTokenMismatch();
    }
  }

  private toEvent(userId: string, verified: VerifiedAppleSubscription): NormalizedPurchaseEvent {
    const transaction = verified.currentTransaction;
    const renewal = verified.renewalInfo;
    const autoRenewEnabled = renewal?.autoRenewStatus === AutoRenewStatus.ON;
    const revoked = Boolean(transaction.revocationDate) || verified.status === Status.REVOKED;
    const subscriptionStatus = this.getSubscriptionStatus(verified.status, autoRenewEnabled, revoked);
    const eventType = this.getEventType(verified, autoRenewEnabled, revoked);
    const expiresAt =
      verified.status === Status.BILLING_GRACE_PERIOD
        ? renewal?.gracePeriodExpiresDate
        : transaction.expiresDate;
    const transactionId = this.requireValue(transaction.transactionId, "transactionId");
    const productId = this.requireValue(transaction.productId, "productId");
    const originalTransactionId = this.requireValue(
      transaction.originalTransactionId,
      "originalTransactionId",
    );
    const stateVersion = [
      verified.status,
      autoRenewEnabled ? "renew-on" : "renew-off",
      transaction.revocationDate ?? "not-revoked",
      expiresAt ?? "no-expiry",
    ].join(":");

    return {
      autoRenewEnabled,
      environment:
        verified.environment === Environment.PRODUCTION ? "production" : "sandbox",
      eventType,
      expiresAt: this.toIsoString(expiresAt),
      idempotencyKey: `apple:verify:${transactionId}:${stateVersion}`,
      originalTransactionId,
      provider: "apple",
      providerProductId: productId,
      purchasedAt: this.toIsoString(transaction.purchaseDate),
      rawPayload: {
        currentTransaction: transaction,
        rawStatusResponse: verified.rawStatusResponse,
        renewalInfo: renewal,
        requestedTransaction: verified.requestedTransaction,
        status: verified.status,
      },
      result: "success",
      revokedAt: this.toIsoString(transaction.revocationDate),
      subscriptionStatus,
      transactionId,
      userId,
      verifiedAt: new Date().toISOString(),
    };
  }

  private getEventType(
    verified: VerifiedAppleSubscription,
    autoRenewEnabled: boolean,
    revoked: boolean,
  ): PurchaseEventType {
    if (revoked) return "REVOKED";
    if (verified.status === Status.EXPIRED || verified.status === Status.BILLING_RETRY) {
      return "EXPIRED";
    }
    if (verified.status === Status.ACTIVE && !autoRenewEnabled) return "CANCELED";
    if (verified.status === Status.BILLING_GRACE_PERIOD) return "RESTORED";
    return verified.currentTransaction.transactionReason === TransactionReason.RENEWAL
      ? "RENEWED"
      : "PURCHASED";
  }

  private getSubscriptionStatus(
    status: Status,
    autoRenewEnabled: boolean,
    revoked: boolean,
  ): PurchaseSubscriptionStatus {
    if (revoked) return "revoked";
    if (status === Status.BILLING_GRACE_PERIOD) return "in_grace_period";
    if (status === Status.BILLING_RETRY) return "billing_retry";
    if (status === Status.EXPIRED) return "expired";
    if (!autoRenewEnabled) return "canceled";
    return "active";
  }

  private accountTokenMismatch() {
    return new ForbiddenException({
      code: "APPLE_ACCOUNT_TOKEN_MISMATCH",
      message: "Apple purchase is not linked to this Trailbook account.",
    });
  }

  private requireValue(value: string | undefined, field: string) {
    if (!value) {
      throw new UnprocessableEntityException({
        code: "APPLE_TRANSACTION_INVALID",
        message: `Verified Apple transaction is missing ${field}.`,
      });
    }
    return value;
  }

  private toIsoString(value: number | undefined) {
    return value === undefined ? undefined : new Date(value).toISOString();
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
