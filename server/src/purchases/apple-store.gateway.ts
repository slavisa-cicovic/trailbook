import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import {
  APIError,
  APIException,
  AppStoreServerAPIClient,
  Environment,
  type NotificationHistoryRequest,
  type ResponseBodyV2DecodedPayload,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type Status,
} from "@apple/app-store-server-library";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ApplePurchaseConfig } from "./apple-purchase.config";

export const APPLE_STORE_GATEWAY = Symbol("APPLE_STORE_GATEWAY");

export interface VerifiedAppleSubscription {
  currentTransaction: JWSTransactionDecodedPayload;
  environment: Environment;
  rawStatusResponse: unknown;
  renewalInfo: JWSRenewalInfoDecodedPayload | null;
  requestedTransaction: JWSTransactionDecodedPayload;
  status: Status;
}

export interface VerifiedAppleNotification {
  environment: Environment;
  payload: ResponseBodyV2DecodedPayload;
  renewalInfo: JWSRenewalInfoDecodedPayload | null;
  transaction: JWSTransactionDecodedPayload | null;
}

export interface AppleNotificationHistoryInput {
  endDate: number;
  environment: Environment;
  onlyFailures?: boolean;
  startDate: number;
}

export interface AppleStoreGateway {
  getNotificationHistory(input: AppleNotificationHistoryInput): Promise<string[]>;
  requestTestNotification(environment: Environment): Promise<string>;
  verifyNotification(signedPayload: string): Promise<VerifiedAppleNotification>;
  verifySubscription(transactionId: string): Promise<VerifiedAppleSubscription>;
}

@Injectable()
export class AppleAppStoreGateway implements AppleStoreGateway {
  private readonly roots = [
    "AppleIncRootCertificate.cer",
    "AppleRootCA-G2.cer",
    "AppleRootCA-G3.cer",
  ].map((name) => readFileSync(join(__dirname, "apple-root-certificates", name)));

  constructor(private readonly config: ApplePurchaseConfig) {}

  async verifyNotification(signedPayload: string): Promise<VerifiedAppleNotification> {
    for (const environment of this.config.allowedEnvironments) {
      try {
        const verifier = this.createVerifier(environment);
        const payload = await verifier.verifyAndDecodeNotification(signedPayload);
        const transaction = payload.data?.signedTransactionInfo
          ? await verifier.verifyAndDecodeTransaction(payload.data.signedTransactionInfo)
          : null;
        const renewalInfo = payload.data?.signedRenewalInfo
          ? await verifier.verifyAndDecodeRenewalInfo(payload.data.signedRenewalInfo)
          : null;
        return { environment, payload, renewalInfo, transaction };
      } catch (error) {
        if (
          error instanceof VerificationException &&
          error.status === VerificationStatus.INVALID_ENVIRONMENT
        ) {
          continue;
        }
        throw new UnprocessableEntityException({
          code: "APPLE_NOTIFICATION_INVALID",
          message: "Apple notification signature or payload is invalid.",
        });
      }
    }
    throw new UnprocessableEntityException({
      code: "APPLE_ENVIRONMENT_MISMATCH",
      message: "Apple notification belongs to a disabled environment.",
    });
  }

  async getNotificationHistory(input: AppleNotificationHistoryInput): Promise<string[]> {
    this.ensureEnvironmentAllowed(input.environment);
    const client = this.createClient(input.environment);
    const request: NotificationHistoryRequest = {
      endDate: input.endDate,
      onlyFailures: input.onlyFailures,
      startDate: input.startDate,
    };
    const payloads: string[] = [];
    let paginationToken: string | null = null;
    do {
      const response = await client.getNotificationHistory(paginationToken, request);
      payloads.push(
        ...(response.notificationHistory ?? [])
          .map((item) => item.signedPayload)
          .filter((value): value is string => Boolean(value)),
      );
      paginationToken = response.hasMore ? response.paginationToken ?? null : null;
    } while (paginationToken);
    return payloads;
  }

  async requestTestNotification(environment: Environment): Promise<string> {
    this.ensureEnvironmentAllowed(environment);
    const response = await this.createClient(environment).requestTestNotification();
    if (!response.testNotificationToken) throw this.verificationUnavailable();
    return response.testNotificationToken;
  }

  async verifySubscription(transactionId: string): Promise<VerifiedAppleSubscription> {
    let notFound = false;
    for (const environment of this.config.allowedEnvironments) {
      try {
        return await this.verifyInEnvironment(transactionId, environment);
      } catch (error) {
        if (this.isTransactionNotFound(error)) {
          notFound = true;
          continue;
        }
        throw this.mapAppleError(error);
      }
    }

    if (notFound) {
      throw new UnprocessableEntityException({
        code: "APPLE_TRANSACTION_INVALID",
        message: "Apple transaction was not found in an allowed environment.",
      });
    }
    throw this.verificationUnavailable();
  }

  private async verifyInEnvironment(
    transactionId: string,
    environment: Environment,
  ): Promise<VerifiedAppleSubscription> {
    const client = this.createClient(environment);
    const verifier = this.createVerifier(environment);

    const transactionResponse = await client.getTransactionInfo(transactionId);
    if (!transactionResponse.signedTransactionInfo) throw this.verificationUnavailable();
    const requestedTransaction = await verifier.verifyAndDecodeTransaction(
      transactionResponse.signedTransactionInfo,
    );
    const originalTransactionId = requestedTransaction.originalTransactionId;
    if (!originalTransactionId) throw this.verificationUnavailable();

    const statusResponse = await client.getAllSubscriptionStatuses(originalTransactionId);
    if (statusResponse.bundleId !== this.config.bundleId || statusResponse.environment !== environment) {
      throw new UnprocessableEntityException({
        code: "APPLE_ENVIRONMENT_MISMATCH",
        message: "Apple subscription status does not match the configured application.",
      });
    }

    const candidates = (statusResponse.data ?? [])
      .flatMap((group) => group.lastTransactions ?? [])
      .filter((item) => item.originalTransactionId === originalTransactionId && item.signedTransactionInfo);
    const decoded = await Promise.all(
      candidates.map(async (item) => ({
        item,
        renewalInfo: item.signedRenewalInfo
          ? await verifier.verifyAndDecodeRenewalInfo(item.signedRenewalInfo)
          : null,
        transaction: await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo!),
      })),
    );
    const current = decoded.sort(
      (left, right) =>
        (right.transaction.signedDate ?? right.transaction.purchaseDate ?? 0) -
        (left.transaction.signedDate ?? left.transaction.purchaseDate ?? 0),
    )[0];
    if (!current?.item.status) {
      throw new UnprocessableEntityException({
        code: "APPLE_TRANSACTION_INVALID",
        message: "Apple returned no current subscription state for this transaction.",
      });
    }

    return {
      currentTransaction: current.transaction,
      environment,
      rawStatusResponse: statusResponse,
      renewalInfo: current.renewalInfo,
      requestedTransaction,
      status: current.item.status,
    };
  }

  private isTransactionNotFound(error: unknown) {
    return error instanceof APIException && error.apiError === APIError.TRANSACTION_ID_NOT_FOUND;
  }

  private createClient(environment: Environment) {
    return new AppStoreServerAPIClient(
      this.config.privateKey,
      this.config.keyId,
      this.config.issuerId,
      this.config.bundleId,
      environment,
    );
  }

  private createVerifier(environment: Environment) {
    return new SignedDataVerifier(
      this.roots,
      true,
      environment,
      this.config.bundleId,
      environment === Environment.PRODUCTION ? this.config.appAppleId : undefined,
    );
  }

  private ensureEnvironmentAllowed(environment: Environment) {
    if (!this.config.allowedEnvironments.includes(environment)) {
      throw new UnprocessableEntityException({
        code: "APPLE_ENVIRONMENT_MISMATCH",
        message: "Apple environment is disabled.",
      });
    }
  }

  private mapAppleError(error: unknown) {
    if (error instanceof UnprocessableEntityException) return error;
    if (error instanceof APIException && error.httpStatusCode >= 400 && error.httpStatusCode < 500) {
      return new UnprocessableEntityException({
        code: "APPLE_TRANSACTION_INVALID",
        message: "Apple rejected the transaction verification request.",
      });
    }
    return this.verificationUnavailable();
  }

  private verificationUnavailable() {
    return new ServiceUnavailableException({
      code: "APPLE_PURCHASE_VERIFICATION_FAILED",
      message: "Apple purchase verification is temporarily unavailable.",
    });
  }
}
