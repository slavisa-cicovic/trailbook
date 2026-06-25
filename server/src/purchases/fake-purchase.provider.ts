import { BadRequestException, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { findFakePurchaseProduct } from "./purchase-catalog";
import type {
  FakePurchaseScenario,
  NormalizedPurchaseEvent,
  PurchaseEnvironmentName,
  PurchaseEventType,
  PurchaseResultName,
} from "./purchase.types";

@Injectable()
export class FakePurchaseProvider {
  completePurchase(input: {
    productId: string;
    scenario?: FakePurchaseScenario;
    transactionId?: string;
    userId: string;
  }): NormalizedPurchaseEvent | null {
    const product = findFakePurchaseProduct(input.productId);
    if (!product) {
      throw new BadRequestException("Unknown fake purchase product.");
    }

    const scenario = input.scenario ?? "success";
    if (scenario === "cancel") {
      return null;
    }

    const now = new Date();
    const originalTransactionId = `fake:${input.userId}:${input.productId}`;
    const transactionId =
      input.transactionId ?? `${originalTransactionId}:${scenario}:${now.getTime()}:${randomUUID()}`;
    const eventType = this.getEventType(scenario);

    return {
      environment: this.getEnvironment(),
      eventType,
      expiresAt: this.getExpiresAt(product.billingType, scenario, now)?.toISOString(),
      idempotencyKey: `fake:${transactionId}`,
      originalTransactionId,
      provider: "fake",
      providerProductId: input.productId,
      purchasedAt:
        eventType === "PURCHASED" || eventType === "RESTORED"
          ? now.toISOString()
          : undefined,
      rawPayload: {
        productId: input.productId,
        provider: "fake",
        scenario,
        transactionId,
        userId: input.userId,
      },
      result: this.getResult(scenario),
      revokedAt:
        scenario === "refund" || scenario === "revoke" ? now.toISOString() : undefined,
      transactionId,
      userId: input.userId,
    };
  }

  private getEnvironment(): PurchaseEnvironmentName {
    const value = process.env.PURCHASE_ENVIRONMENT;
    return value === "sandbox" || value === "production" ? value : "local";
  }

  private getEventType(scenario: Exclude<FakePurchaseScenario, "cancel">): PurchaseEventType {
    const eventByScenario: Record<Exclude<FakePurchaseScenario, "cancel">, PurchaseEventType> = {
      decline: "DECLINED",
      expired: "EXPIRED",
      pending: "PENDING",
      refund: "REFUNDED",
      renew: "RENEWED",
      restore: "RESTORED",
      revoke: "REVOKED",
      subscription_canceled: "CANCELED",
      success: "PURCHASED",
    };
    return eventByScenario[scenario];
  }

  private getResult(
    scenario: Exclude<FakePurchaseScenario, "cancel">,
  ): PurchaseResultName {
    if (scenario === "decline") return "declined";
    if (scenario === "pending") return "pending";
    return "success";
  }

  private getExpiresAt(
    billingType: "monthly" | "yearly" | "lifetime",
    scenario: Exclude<FakePurchaseScenario, "cancel">,
    now: Date,
  ) {
    if (billingType === "lifetime") return null;
    if (scenario === "expired" || scenario === "refund" || scenario === "revoke") {
      return now;
    }

    const expiresAt = new Date(now);
    if (billingType === "yearly") {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }
    return expiresAt;
  }
}
