import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { FAKE_PURCHASE_PRODUCTS, getFakeProductDefinition } from "./purchase-catalog";
import type { PurchaseProvider } from "./purchase-provider";
import type {
  FakePurchaseScenario,
  NormalizedPurchaseEvent,
  PurchaseEnvironmentName,
  PurchaseEventTypeName,
  PurchaseProductResponse,
  PurchaseResultName,
} from "./purchase.types";

@Injectable()
export class FakePurchaseProvider implements PurchaseProvider {
  readonly provider = "fake" as const;

  async listProducts(_input?: {
    platform?: "android" | "ios" | "web";
    userId: string;
  }): Promise<PurchaseProductResponse[]> {
    return FAKE_PURCHASE_PRODUCTS.map((product) => ({
      billingType: product.billingType,
      description: product.description,
      entitlements: product.entitlements,
      planCode: product.planCode,
      priceLabel: product.priceLabel,
      productId: product.providerProductId,
      provider: product.provider,
      title: product.name,
    }));
  }

  async completePurchase(input: {
    providerProductId: string;
    purchaseToken?: string;
    scenario?: FakePurchaseScenario;
    transactionId?: string;
    userId: string;
  }): Promise<NormalizedPurchaseEvent | null> {
    const product = getFakeProductDefinition(input.providerProductId);

    if (!product) {
      throw new BadRequestException("Unknown fake purchase product.");
    }

    const scenario = input.scenario ?? "success";

    if (scenario === "cancel") {
      return null;
    }

    const now = new Date();
    const originalTransactionId = `fake:${input.userId}:${input.providerProductId}:original`;
    const transactionId =
      input.transactionId ?? `${originalTransactionId}:${scenario}:${now.getTime()}:${randomUUID()}`;
    const eventType = this.getEventType(scenario);
    const purchaseResult = this.getPurchaseResult(scenario);
    const expiresAt = this.getExpiresAt(product.billingType, scenario, now);
    const revokedAt =
      scenario === "refund" || scenario === "revoke" ? now.toISOString() : undefined;

    return {
      environment: this.getEnvironment(),
      eventType,
      expiresAt: expiresAt?.toISOString(),
      idempotencyKey: `fake:${transactionId}`,
      provider: "fake",
      providerOriginalTransactionId: originalTransactionId,
      providerProductId: input.providerProductId,
      providerTransactionId: transactionId,
      purchaseResult,
      purchasedAt: eventType === "PURCHASED" || eventType === "RESTORED" ? now.toISOString() : undefined,
      rawPayload: {
        provider: "fake",
        providerProductId: input.providerProductId,
        scenario,
        transactionId,
        userId: input.userId,
      },
      revokedAt,
      userId: input.userId,
    };
  }

  async refreshSubscription(): Promise<NormalizedPurchaseEvent[]> {
    return [];
  }

  private getEnvironment(): PurchaseEnvironmentName {
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

  private getEventType(scenario: Exclude<FakePurchaseScenario, "cancel">): PurchaseEventTypeName {
    switch (scenario) {
      case "renew":
        return "RENEWED";
      case "subscription_canceled":
        return "CANCELED";
      case "expired":
        return "EXPIRED";
      case "refund":
        return "REFUNDED";
      case "revoke":
        return "REVOKED";
      case "decline":
        return "DECLINED";
      case "pending":
        return "PENDING";
      case "restore":
        return "RESTORED";
      case "success":
        return "PURCHASED";
    }
  }

  private getPurchaseResult(scenario: Exclude<FakePurchaseScenario, "cancel">): PurchaseResultName {
    switch (scenario) {
      case "decline":
        return "declined";
      case "pending":
        return "pending";
      case "success":
      case "renew":
      case "subscription_canceled":
      case "expired":
      case "refund":
      case "revoke":
      case "restore":
        return "success";
    }
  }

  private getExpiresAt(
    billingType: "lifetime" | "monthly" | "none" | "yearly",
    scenario: Exclude<FakePurchaseScenario, "cancel">,
    now: Date,
  ) {
    if (billingType === "lifetime") {
      return null;
    }

    if (scenario === "expired" || scenario === "refund" || scenario === "revoke") {
      return now;
    }

    const expiresAt = new Date(now);

    if (billingType === "yearly") {
      expiresAt.setFullYear(expiresAt.getFullYear() + (scenario === "renew" ? 2 : 1));
      return expiresAt;
    }

    expiresAt.setMonth(expiresAt.getMonth() + (scenario === "renew" ? 2 : 1));
    return expiresAt;
  }
}
