import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { decodeJwt, importPKCS8, SignJWT } from "jose";

import { getApplePurchaseProducts } from "./purchase-catalog";
import type { PurchaseProvider } from "./purchase-provider";
import type {
  NormalizedPurchaseEvent,
  PurchaseEnvironmentName,
  PurchaseEventTypeName,
  PurchaseProductResponse,
  PurchaseResultName,
} from "./purchase.types";

interface AppleTransactionPayload {
  bundleId?: string;
  environment?: "Production" | "Sandbox";
  expiresDate?: number | string;
  originalTransactionId?: string;
  productId?: string;
  purchaseDate?: number | string;
  revocationDate?: number | string;
  transactionId?: string;
}

interface AppleTransactionInfoResponse {
  signedTransactionInfo?: string;
}

function parseAppleMillis(value: number | string | undefined): Date | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const timestamp = typeof value === "number" ? value : Number.parseInt(value, 10);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp);
}

function resolveAppleEnvironment(payload: AppleTransactionPayload): PurchaseEnvironmentName {
  if (payload.environment === "Production") {
    return "production";
  }

  return "sandbox";
}

export function normalizeAppleTransactionPayload(input: {
  fallbackProductId: string;
  payload: AppleTransactionPayload;
  userId: string;
}): NormalizedPurchaseEvent {
  const transactionId = input.payload.transactionId;
  const productId = input.payload.productId ?? input.fallbackProductId;

  if (!transactionId) {
    throw new BadRequestException("Apple transaction payload is missing transactionId.");
  }

  if (!productId) {
    throw new BadRequestException("Apple transaction payload is missing productId.");
  }

  if (productId !== input.fallbackProductId) {
    throw new BadRequestException("Apple transaction product does not match requested product.");
  }

  const now = new Date();
  const expiresAt = parseAppleMillis(input.payload.expiresDate);
  const purchasedAt = parseAppleMillis(input.payload.purchaseDate) ?? now;
  const revokedAt = parseAppleMillis(input.payload.revocationDate);
  const isExpired = expiresAt !== null && expiresAt <= now;
  const eventType: PurchaseEventTypeName = revokedAt ? "REVOKED" : isExpired ? "EXPIRED" : "PURCHASED";
  const purchaseResult: PurchaseResultName = "success";
  const stateMarker = revokedAt?.toISOString() ?? expiresAt?.toISOString() ?? purchasedAt.toISOString();

  return {
    environment: resolveAppleEnvironment(input.payload),
    eventType,
    expiresAt: expiresAt?.toISOString(),
    idempotencyKey: `apple:${transactionId}:${eventType}:${stateMarker}`,
    provider: "apple",
    providerOriginalTransactionId: input.payload.originalTransactionId ?? transactionId,
    providerProductId: productId,
    providerTransactionId: transactionId,
    purchaseResult,
    purchasedAt: purchasedAt.toISOString(),
    rawPayload: {
      provider: "apple",
      transaction: input.payload,
    },
    revokedAt: revokedAt?.toISOString(),
    userId: input.userId,
  };
}

@Injectable()
export class ApplePurchaseProvider implements PurchaseProvider {
  readonly provider = "apple" as const;

  async listProducts(_input: {
    platform?: "android" | "ios" | "web";
    userId: string;
  }): Promise<PurchaseProductResponse[]> {
    return getApplePurchaseProducts().map((product) => ({
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
    transactionId?: string;
    userId: string;
  }): Promise<NormalizedPurchaseEvent | null> {
    if (!input.transactionId) {
      throw new BadRequestException("Apple verification requires transactionId.");
    }

    const signedTransactionInfo = await this.fetchSignedTransactionInfo(input.transactionId);
    const payload = decodeJwt(signedTransactionInfo) as AppleTransactionPayload;

    return normalizeAppleTransactionPayload({
      fallbackProductId: input.providerProductId,
      payload,
      userId: input.userId,
    });
  }

  async refreshSubscription(): Promise<NormalizedPurchaseEvent[]> {
    return [];
  }

  private async fetchSignedTransactionInfo(transactionId: string): Promise<string> {
    const token = await this.createAppStoreServerToken();
    const endpointBaseUrl = this.getAppStoreServerBaseUrl();
    const response = await fetch(`${endpointBaseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new BadRequestException(`Apple transaction verification failed with status ${response.status}.`);
    }

    const payload = (await response.json().catch(() => null)) as AppleTransactionInfoResponse | null;

    if (!payload?.signedTransactionInfo) {
      throw new BadRequestException("Apple transaction verification response is missing signedTransactionInfo.");
    }

    return payload.signedTransactionInfo;
  }

  private async createAppStoreServerToken(): Promise<string> {
    const issuerId = process.env.APPLE_APP_STORE_ISSUER_ID?.trim();
    const keyId = process.env.APPLE_APP_STORE_KEY_ID?.trim();
    const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
    const privateKey = process.env.APPLE_APP_STORE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

    if (!issuerId || !keyId || !bundleId || !privateKey) {
      throw new ServiceUnavailableException("Apple App Store Server API credentials are not configured.");
    }

    const key = await importPKCS8(privateKey, "ES256");

    return new SignJWT({ bid: bundleId })
      .setProtectedHeader({ alg: "ES256", kid: keyId, typ: "JWT" })
      .setIssuer(issuerId)
      .setAudience("appstoreconnect-v1")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(key);
  }

  private getAppStoreServerBaseUrl() {
    return process.env.APPLE_APP_STORE_ENVIRONMENT === "production"
      ? "https://api.storekit.itunes.apple.com"
      : "https://api.storekit-sandbox.itunes.apple.com";
  }
}
