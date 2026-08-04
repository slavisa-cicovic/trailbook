import { createHash } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

@Injectable()
export class GooglePurchaseConfig {
  get packageName() {
    return this.required("GOOGLE_PLAY_PACKAGE_NAME");
  }

  get productId() {
    return process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID?.trim() || "trailbook_premium";
  }

  get pubsubAudience() {
    return this.required("GOOGLE_PLAY_PUBSUB_AUDIENCE");
  }

  get pubsubServiceAccountEmail() {
    return this.required("GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL").toLowerCase();
  }

  get basePlanIds() {
    return new Set([
      process.env.GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID?.trim() || "monthly",
      process.env.GOOGLE_PLAY_YEARLY_BASE_PLAN_ID?.trim() || "yearly",
    ]);
  }

  get serviceAccount() {
    const raw = this.required("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    try {
      const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
      if (!parsed.client_email || !parsed.private_key) throw new Error("missing credentials");
      return parsed;
    } catch {
      throw this.configurationError("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    }
  }

  accountId(userId: string) {
    return createHash("sha256").update(`trailbook:google-play:${userId}`).digest("hex");
  }

  private required(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw this.configurationError(name);
    return value;
  }

  private configurationError(name: string) {
    return new ServiceUnavailableException({
      code: "GOOGLE_PURCHASE_VERIFICATION_FAILED",
      message: `Google Play purchase configuration is missing or invalid: ${name}.`,
    });
  }
}
