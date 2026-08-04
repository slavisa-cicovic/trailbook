import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";

import { PurchaseApplicationService } from "./purchase-application.service";
import { GooglePurchaseConfig } from "./google-purchase.config";
import {
  GOOGLE_PLAY_GATEWAY,
  type GooglePlayGateway,
  type VerifiedGoogleSubscription,
} from "./google-play.gateway";
import type {
  GooglePurchaseVerificationInput,
  NormalizedPurchaseEvent,
  PurchaseEventType,
  PurchaseSubscriptionStatus,
} from "./purchase.types";

@Injectable()
export class GooglePurchaseProvider {
  constructor(
    @Inject(PurchaseApplicationService)
    private readonly purchaseApplication: PurchaseApplicationService,
    @Inject(GooglePurchaseConfig) private readonly config: GooglePurchaseConfig,
    @Inject(GOOGLE_PLAY_GATEWAY) private readonly gateway: GooglePlayGateway,
  ) {}

  getAccountId(userId: string) {
    return { obfuscatedAccountId: this.config.accountId(userId) };
  }

  async verifyPurchase(input: GooglePurchaseVerificationInput) {
    this.validateInput(input);
    const verified = await this.gateway.verifySubscription(input.purchaseToken);
    const lineItem = this.validateVerifiedPurchase(input, verified);
    const access = await this.purchaseApplication.applyEvent(
      this.toEvent(input, verified, lineItem),
    );

    // Persist the verified event before acknowledgment. A repeated request is
    // idempotent and retries acknowledgment if Google was temporarily down.
    if (
      verified.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" &&
      verified.state !== "SUBSCRIPTION_STATE_PENDING"
    ) {
      await this.gateway.acknowledge(input.productId, input.purchaseToken);
    }
    return access;
  }

  async syncPurchase(
    userId: string,
    purchaseToken: string,
    eventTypeHint?: PurchaseEventType,
    idempotencyKeyPrefix = "google:sync",
  ) {
    if (!userId || !purchaseToken?.trim()) {
      throw new BadRequestException("userId and purchaseToken are required.");
    }
    const verified = await this.gateway.verifySubscription(purchaseToken);
    if (verified.externalAccountId !== this.config.accountId(userId)) {
      throw new ForbiddenException({
        code: "GOOGLE_ACCOUNT_ID_MISMATCH",
        message: "Google Play purchase is not linked to this Trailbook account.",
      });
    }
    const lineItem = verified.lineItems.find(
      (item) => item.productId === this.config.productId && Boolean(item.basePlanId && this.config.basePlanIds.has(item.basePlanId)),
    );
    if (!lineItem?.basePlanId || !lineItem.productId || !verified.state || !KNOWN_SUBSCRIPTION_STATES.has(verified.state)) {
      throw new UnprocessableEntityException({
        code: "GOOGLE_PURCHASE_STATE_INVALID",
        message: "Google Play returned an unsupported subscription state.",
      });
    }
    const input = {
      basePlanId: lineItem.basePlanId,
      productId: lineItem.productId,
      purchaseToken,
      userId,
    };
    return this.purchaseApplication.applyEvent(
      this.toEvent(input, verified, lineItem, eventTypeHint, idempotencyKeyPrefix),
    );
  }

  private validateInput(input: GooglePurchaseVerificationInput) {
    if (!input.productId?.trim() || !input.basePlanId?.trim() || !input.purchaseToken?.trim()) {
      throw new BadRequestException("productId, basePlanId and purchaseToken are required.");
    }
    if (input.productId !== this.config.productId || !this.config.basePlanIds.has(input.basePlanId)) {
      throw new UnprocessableEntityException({
        code: "GOOGLE_PRODUCT_NOT_ALLOWED",
        message: "Google Play product or base plan is not configured for Trailbook Premium.",
      });
    }
  }

  private validateVerifiedPurchase(
    input: GooglePurchaseVerificationInput,
    verified: VerifiedGoogleSubscription,
  ) {
    if (verified.externalAccountId !== this.config.accountId(input.userId)) {
      throw new ForbiddenException({
        code: "GOOGLE_ACCOUNT_ID_MISMATCH",
        message: "Google Play purchase is not linked to this Trailbook account.",
      });
    }
    const lineItem = verified.lineItems.find(
      (item) => item.productId === input.productId && item.basePlanId === input.basePlanId,
    );
    if (!lineItem) {
      throw new UnprocessableEntityException({
        code: "GOOGLE_PRODUCT_NOT_ALLOWED",
        message: "Verified Google Play subscription does not match the requested base plan.",
      });
    }
    if (!verified.state || !KNOWN_SUBSCRIPTION_STATES.has(verified.state)) {
      throw new UnprocessableEntityException({
        code: "GOOGLE_PURCHASE_STATE_INVALID",
        message: "Google Play returned an invalid subscription state.",
      });
    }
    return lineItem;
  }

  private toEvent(
    input: GooglePurchaseVerificationInput,
    verified: VerifiedGoogleSubscription,
    lineItem: VerifiedGoogleSubscription["lineItems"][number],
    eventTypeHint?: PurchaseEventType,
    idempotencyKeyPrefix = "google:verify",
  ): NormalizedPurchaseEvent {
    const { eventType, result, status } = this.normalizeState(
      verified.state!,
      lineItem.autoRenewEnabled,
    );
    const stateVersion = [
      verified.state,
      lineItem.autoRenewEnabled ? "renew-on" : "renew-off",
      lineItem.expiryTime ?? "no-expiry",
      input.basePlanId,
    ].join(":");
    return {
      autoRenewEnabled: lineItem.autoRenewEnabled,
      environment: verified.testPurchase ? "sandbox" : "production",
      eventType: this.eventTypeForState(eventTypeHint, eventType, status),
      expiresAt: lineItem.expiryTime ?? undefined,
      idempotencyKey: `${idempotencyKeyPrefix}:${input.purchaseToken}:${stateVersion}`,
      originalTransactionId: input.purchaseToken,
      provider: "google",
      providerBasePlanId: input.basePlanId,
      providerProductId: input.productId,
      rawPayload: verified.rawPayload,
      result,
      subscriptionStatus: status,
      transactionId: input.purchaseToken,
      userId: input.userId,
      verifiedAt: new Date().toISOString(),
    };
  }

  private eventTypeForState(
    hint: PurchaseEventType | undefined,
    normalized: PurchaseEventType,
    status: PurchaseSubscriptionStatus,
  ) {
    if (!hint || status !== "active") return normalized;
    return hint;
  }

  private normalizeState(state: string, autoRenewEnabled: boolean): {
    eventType: PurchaseEventType;
    result: NormalizedPurchaseEvent["result"];
    status: PurchaseSubscriptionStatus;
  } {
    if (state === "SUBSCRIPTION_STATE_PENDING") {
      return { eventType: "PENDING", result: "pending", status: "expired" };
    }
    if (state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") {
      return { eventType: "RESTORED", result: "success", status: "in_grace_period" };
    }
    if (state === "SUBSCRIPTION_STATE_ON_HOLD" || state === "SUBSCRIPTION_STATE_PAUSED") {
      return { eventType: "EXPIRED", result: "success", status: "billing_retry" };
    }
    if (state === "SUBSCRIPTION_STATE_EXPIRED") {
      return { eventType: "EXPIRED", result: "success", status: "expired" };
    }
    if (state === "SUBSCRIPTION_STATE_CANCELED" || !autoRenewEnabled) {
      return { eventType: "CANCELED", result: "success", status: "canceled" };
    }
    return { eventType: "PURCHASED", result: "success", status: "active" };
  }
}

const KNOWN_SUBSCRIPTION_STATES = new Set([
  "SUBSCRIPTION_STATE_PENDING",
  "SUBSCRIPTION_STATE_ACTIVE",
  "SUBSCRIPTION_STATE_PAUSED",
  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
  "SUBSCRIPTION_STATE_ON_HOLD",
  "SUBSCRIPTION_STATE_CANCELED",
  "SUBSCRIPTION_STATE_EXPIRED",
]);
