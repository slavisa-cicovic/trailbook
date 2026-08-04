import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { GooglePurchaseConfig } from "./google-purchase.config";
import { GooglePurchaseProvider } from "./google-purchase.provider";
import { GOOGLE_PUBSUB_AUTH, type GooglePubsubAuth } from "./google-pubsub-auth";
import type { PurchaseEventType } from "./purchase.types";

export interface GooglePubsubPushBody {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
}

interface DeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  testNotification?: { version?: string };
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
  };
}

@Injectable()
export class GoogleNotificationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GooglePurchaseConfig) private readonly config: GooglePurchaseConfig,
    @Inject(GooglePurchaseProvider) private readonly provider: GooglePurchaseProvider,
    @Inject(GOOGLE_PUBSUB_AUTH) private readonly auth: GooglePubsubAuth,
  ) {}

  async handlePush(authorization: string | undefined, body: GooglePubsubPushBody) {
    await this.auth.verify(authorization);
    const messageId = body.message?.messageId?.trim();
    const encoded = body.message?.data?.trim();
    if (!messageId || !encoded) throw new BadRequestException("Invalid Google Pub/Sub message.");
    const notification = this.decode(encoded);
    if (notification.packageName !== this.config.packageName) {
      throw new UnprocessableEntityException("Google notification package does not match Trailbook.");
    }

    let audit = await this.getOrCreate(messageId, body.subscription, notification);
    if (audit.processingStatus === "processed" || audit.processingStatus === "ignored") {
      return { duplicate: true, status: audit.processingStatus };
    }
    audit = await this.database.googlePurchaseNotification.update({
      data: {
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: null,
        processingStatus: "processing",
      },
      where: { id: audit.id },
    });

    try {
      if (notification.testNotification) {
        await this.complete(audit.id, "processed");
        return { duplicate: false, status: "processed", test: true };
      }
      const subscription = notification.subscriptionNotification;
      if (!subscription) {
        await this.complete(audit.id, "ignored");
        return { duplicate: false, status: "ignored" };
      }
      if (!subscription.purchaseToken?.trim() || !Number.isInteger(subscription.notificationType)) {
        throw new BadRequestException("Invalid Google subscription notification.");
      }
      const notificationType = subscription.notificationType as number;
      const owner = await this.database.purchaseEvent.findFirst({
        orderBy: { createdAt: "desc" },
        select: { userId: true },
        where: {
          OR: [
            { transactionId: subscription.purchaseToken },
            { originalTransactionId: subscription.purchaseToken },
          ],
          provider: "google",
        },
      });
      if (!owner) {
        throw new ServiceUnavailableException({
          code: "GOOGLE_PURCHASE_OWNER_PENDING",
          message: "The Google purchase has not been linked to a Trailbook account yet.",
        });
      }
      await this.provider.syncPurchase(
        owner.userId,
        subscription.purchaseToken,
        EVENT_TYPE_HINTS.get(notificationType),
        `google:rtdn:${messageId}`,
      );
      await this.database.googlePurchaseNotification.update({
        data: {
          lastError: null,
          processedAt: new Date(),
          processingStatus: "processed",
          userId: owner.userId,
        },
        where: { id: audit.id },
      });
      return { duplicate: false, status: "processed" };
    } catch (error) {
      await this.database.googlePurchaseNotification.update({
        data: { lastError: this.errorMessage(error), processingStatus: "failed" },
        where: { id: audit.id },
      });
      throw error;
    }
  }

  private decode(encoded: string): DeveloperNotification {
    try {
      const value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as DeveloperNotification;
      if (!value || typeof value !== "object") throw new Error("invalid payload");
      return value;
    } catch {
      throw new BadRequestException("Google Pub/Sub data is not valid base64 JSON.");
    }
  }

  private async getOrCreate(
    messageId: string,
    subscription: string | undefined,
    notification: DeveloperNotification,
  ) {
    const existing = await this.database.googlePurchaseNotification.findUnique({ where: { messageId } });
    if (existing) return existing;
    try {
      return await this.database.googlePurchaseNotification.create({
        data: {
          decodedPayload: notification as Prisma.InputJsonValue,
          messageId,
          notificationType: notification.subscriptionNotification?.notificationType,
          packageName: notification.packageName,
          subscription,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const concurrent = await this.database.googlePurchaseNotification.findUnique({ where: { messageId } });
        if (concurrent) return concurrent;
      }
      throw error;
    }
  }

  private complete(id: string, processingStatus: "ignored" | "processed") {
    return this.database.googlePurchaseNotification.update({
      data: { lastError: null, processedAt: new Date(), processingStatus },
      where: { id },
    });
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 4000) : "Unknown processing error.";
  }
}

const EVENT_TYPE_HINTS = new Map<number, PurchaseEventType>([
  [1, "RESTORED"],
  [2, "RENEWED"],
  [3, "CANCELED"],
  [4, "PURCHASED"],
  [5, "EXPIRED"],
  [6, "RESTORED"],
  [7, "RESTORED"],
  [10, "EXPIRED"],
  [12, "REVOKED"],
  [13, "EXPIRED"],
  [20, "EXPIRED"],
]);
