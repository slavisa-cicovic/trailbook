import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PlanBillingType } from "@prisma/client";
import { importPKCS8, SignJWT } from "jose";

import { getGooglePurchaseProducts } from "./purchase-catalog";
import type { PurchaseProvider } from "./purchase-provider";
import type {
  NormalizedPurchaseEvent,
  PurchaseEnvironmentName,
  PurchaseEventTypeName,
  PurchaseProductResponse,
  PurchaseResultName,
} from "./purchase.types";

interface GoogleServiceAccountCredentials {
  client_email?: string;
  private_key?: string;
}

interface GoogleProductPurchasePayload {
  orderId?: string;
  productId?: string;
  purchaseState?: number;
  purchaseTimeMillis?: string;
  purchaseType?: number;
}

interface GoogleSubscriptionPurchasePayload {
  cancelReason?: number;
  expiryTimeMillis?: string;
  orderId?: string;
  paymentState?: number;
  purchaseType?: number;
  startTimeMillis?: string;
  userCancellationTimeMillis?: string;
}

type GooglePurchasePayload = GoogleProductPurchasePayload | GoogleSubscriptionPurchasePayload;

interface GoogleOAuthTokenResponse {
  access_token?: string;
}

function parseGoogleMillis(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Number.parseInt(value, 10);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp);
}

function resolveGoogleEnvironment(payload: GooglePurchasePayload): PurchaseEnvironmentName {
  return payload.purchaseType === 0 ? "sandbox" : "production";
}

function getGoogleOriginalTransactionId(orderId: string | undefined, purchaseToken: string) {
  return orderId?.split("..")[0] ?? purchaseToken;
}

function isGoogleProductPurchasePayload(payload: GooglePurchasePayload): payload is GoogleProductPurchasePayload {
  return "purchaseState" in payload || "purchaseTimeMillis" in payload;
}

export function normalizeGooglePurchasePayload(input: {
  billingType: PlanBillingType;
  fallbackProductId: string;
  payload: GooglePurchasePayload;
  purchaseToken: string;
  userId: string;
}): NormalizedPurchaseEvent {
  const now = new Date();
  const orderId = input.payload.orderId ?? input.purchaseToken;
  const originalTransactionId = getGoogleOriginalTransactionId(input.payload.orderId, input.purchaseToken);
  let eventType: PurchaseEventTypeName;
  let expiresAt: Date | null = null;
  let purchaseResult: PurchaseResultName = "success";
  let purchasedAt: Date | null = null;

  if (isGoogleProductPurchasePayload(input.payload)) {
    purchasedAt = parseGoogleMillis(input.payload.purchaseTimeMillis) ?? now;

    if (input.payload.purchaseState === 2) {
      eventType = "PENDING";
      purchaseResult = "pending";
    } else if (input.payload.purchaseState === 1) {
      eventType = "CANCELED";
    } else {
      eventType = "PURCHASED";
    }
  } else {
    expiresAt = parseGoogleMillis(input.payload.expiryTimeMillis);
    purchasedAt = parseGoogleMillis(input.payload.startTimeMillis) ?? now;

    if (input.payload.paymentState === 0) {
      eventType = "PENDING";
      purchaseResult = "pending";
    } else if (expiresAt !== null && expiresAt <= now) {
      eventType = "EXPIRED";
    } else if (input.payload.cancelReason !== undefined || input.payload.userCancellationTimeMillis !== undefined) {
      eventType = "CANCELED";
    } else {
      eventType = "PURCHASED";
    }
  }

  const stateMarker =
    expiresAt?.toISOString() ??
    parseGoogleMillis("userCancellationTimeMillis" in input.payload ? input.payload.userCancellationTimeMillis : undefined)?.toISOString() ??
    purchasedAt.toISOString();

  return {
    environment: resolveGoogleEnvironment(input.payload),
    eventType,
    expiresAt: expiresAt?.toISOString(),
    idempotencyKey: `google:${orderId}:${eventType}:${stateMarker}`,
    provider: "google",
    providerOriginalTransactionId: originalTransactionId,
    providerProductId: input.fallbackProductId,
    providerTransactionId: orderId,
    purchaseResult,
    purchasedAt: purchasedAt.toISOString(),
    rawPayload: {
      provider: "google",
      purchase: input.payload,
      purchaseToken: input.purchaseToken,
    },
    userId: input.userId,
  };
}

@Injectable()
export class GooglePurchaseProvider implements PurchaseProvider {
  readonly provider = "google" as const;

  async listProducts(_input: {
    platform?: "android" | "ios" | "web";
    userId: string;
  }): Promise<PurchaseProductResponse[]> {
    return getGooglePurchaseProducts().map((product) => ({
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
    userId: string;
  }): Promise<NormalizedPurchaseEvent | null> {
    if (!input.purchaseToken) {
      throw new BadRequestException("Google verification requires purchaseToken.");
    }

    const product = getGooglePurchaseProducts().find(
      (candidate) => candidate.providerProductId === input.providerProductId,
    );

    if (!product) {
      throw new BadRequestException("Unknown Google purchase product.");
    }

    const payload = await this.fetchPurchasePayload(input.providerProductId, input.purchaseToken, product.billingType);

    return normalizeGooglePurchasePayload({
      billingType: product.billingType,
      fallbackProductId: input.providerProductId,
      payload,
      purchaseToken: input.purchaseToken,
      userId: input.userId,
    });
  }

  async refreshSubscription(): Promise<NormalizedPurchaseEvent[]> {
    return [];
  }

  private async fetchPurchasePayload(
    productId: string,
    purchaseToken: string,
    billingType: PlanBillingType,
  ): Promise<GooglePurchasePayload> {
    const accessToken = await this.createGoogleAccessToken();
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim();

    if (!packageName) {
      throw new ServiceUnavailableException("Google Play package name is not configured.");
    }

    const encodedPackageName = encodeURIComponent(packageName);
    const encodedProductId = encodeURIComponent(productId);
    const encodedPurchaseToken = encodeURIComponent(purchaseToken);
    const resourcePath =
      billingType === "lifetime"
        ? `products/${encodedProductId}/tokens/${encodedPurchaseToken}`
        : `subscriptions/${encodedProductId}/tokens/${encodedPurchaseToken}`;
    const response = await fetch(
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodedPackageName}/purchases/${resourcePath}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new BadRequestException(`Google Play purchase verification failed with status ${response.status}.`);
    }

    return (await response.json()) as GooglePurchasePayload;
  }

  private async createGoogleAccessToken(): Promise<string> {
    const credentials = this.getServiceAccountCredentials();
    const clientEmail = credentials.client_email?.trim();
    const privateKey = credentials.private_key?.replace(/\\n/g, "\n").trim();

    if (!clientEmail || !privateKey) {
      throw new ServiceUnavailableException("Google Play service account credentials are not configured.");
    }

    const key = await importPKCS8(privateKey, "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/androidpublisher",
    })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(clientEmail)
      .setAudience("https://oauth2.googleapis.com/token")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      }).toString(),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`Google Play access token request failed with status ${response.status}.`);
    }

    const payload = (await response.json().catch(() => null)) as GoogleOAuthTokenResponse | null;

    if (!payload?.access_token) {
      throw new ServiceUnavailableException("Google Play access token response is missing access_token.");
    }

    return payload.access_token;
  }

  private getServiceAccountCredentials(): GoogleServiceAccountCredentials {
    const rawJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();

    if (rawJson) {
      try {
        return JSON.parse(rawJson) as GoogleServiceAccountCredentials;
      } catch {
        throw new ServiceUnavailableException("Google Play service account JSON is invalid.");
      }
    }

    return {
      client_email: process.env.GOOGLE_PLAY_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PLAY_PRIVATE_KEY,
    };
  }
}
