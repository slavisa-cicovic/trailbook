import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AppleNotificationService } from "./apple-notification.service";
import { ApplePurchaseConfig } from "./apple-purchase.config";
import { ApplePurchaseProvider } from "./apple-purchase.provider";
import { APPLE_STORE_GATEWAY, AppleAppStoreGateway } from "./apple-store.gateway";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import { PurchaseApplicationService } from "./purchase-application.service";
import { PurchasesController } from "./purchases.controller";
import { GooglePurchaseConfig } from "./google-purchase.config";
import { GooglePurchaseProvider } from "./google-purchase.provider";
import { GOOGLE_PLAY_GATEWAY, GoogleAndroidPublisherGateway } from "./google-play.gateway";
import { GoogleNotificationService } from "./google-notification.service";
import { GOOGLE_PUBSUB_AUTH, GoogleOidcPubsubAuth } from "./google-pubsub-auth";

@Module({
  imports: [AuthModule],
  controllers: [PurchasesController],
  providers: [
    AppleAppStoreGateway,
    AppleNotificationService,
    ApplePurchaseConfig,
    ApplePurchaseProvider,
    FakePurchaseProvider,
    GoogleAndroidPublisherGateway,
    GooglePurchaseConfig,
    GooglePurchaseProvider,
    GoogleNotificationService,
    GoogleOidcPubsubAuth,
    PurchaseApplicationService,
    { provide: APPLE_STORE_GATEWAY, useExisting: AppleAppStoreGateway },
    { provide: GOOGLE_PLAY_GATEWAY, useExisting: GoogleAndroidPublisherGateway },
    { provide: GOOGLE_PUBSUB_AUTH, useExisting: GoogleOidcPubsubAuth },
  ],
  exports: [PurchaseApplicationService],
})
export class PurchasesModule {}
