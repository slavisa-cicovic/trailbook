import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { google, type androidpublisher_v3 } from "googleapis";

import { GooglePurchaseConfig } from "./google-purchase.config";

export interface VerifiedGoogleSubscription {
  acknowledgementState?: string | null;
  externalAccountId?: string | null;
  linkedPurchaseToken?: string | null;
  rawPayload: unknown;
  state?: string | null;
  testPurchase: boolean;
  lineItems: Array<{
    autoRenewEnabled: boolean;
    basePlanId?: string | null;
    expiryTime?: string | null;
    productId?: string | null;
  }>;
}

export interface GooglePlayGateway {
  acknowledge(productId: string, purchaseToken: string): Promise<void>;
  verifySubscription(purchaseToken: string): Promise<VerifiedGoogleSubscription>;
}

export const GOOGLE_PLAY_GATEWAY = Symbol("GOOGLE_PLAY_GATEWAY");

@Injectable()
export class GoogleAndroidPublisherGateway implements GooglePlayGateway {
  constructor(@Inject(GooglePurchaseConfig) private readonly config: GooglePurchaseConfig) {}

  async verifySubscription(purchaseToken: string): Promise<VerifiedGoogleSubscription> {
    try {
      const response = await this.client().purchases.subscriptionsv2.get({
        packageName: this.config.packageName,
        token: purchaseToken,
      });
      const data = response.data;
      return {
        acknowledgementState: data.acknowledgementState,
        externalAccountId: data.externalAccountIdentifiers?.obfuscatedExternalAccountId,
        linkedPurchaseToken: data.linkedPurchaseToken,
        rawPayload: data,
        state: data.subscriptionState,
        testPurchase: Boolean(data.testPurchase),
        lineItems: (data.lineItems ?? []).map((item: androidpublisher_v3.Schema$SubscriptionPurchaseLineItem) => ({
          autoRenewEnabled: Boolean(item.autoRenewingPlan?.autoRenewEnabled),
          basePlanId: item.offerDetails?.basePlanId,
          expiryTime: item.expiryTime,
          productId: item.productId,
        })),
      };
    } catch {
      throw this.unavailable();
    }
  }

  async acknowledge(productId: string, purchaseToken: string) {
    try {
      await this.client().purchases.subscriptions.acknowledge({
        packageName: this.config.packageName,
        subscriptionId: productId,
        token: purchaseToken,
        requestBody: {},
      });
    } catch {
      throw this.unavailable();
    }
  }

  private client() {
    const credentials = this.config.serviceAccount;
    const googleAuth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
    return google.androidpublisher({ auth: googleAuth, version: "v3" });
  }

  private unavailable() {
    return new ServiceUnavailableException({
      code: "GOOGLE_PURCHASE_VERIFICATION_FAILED",
      message: "Google Play could not verify the subscription.",
    });
  }
}
