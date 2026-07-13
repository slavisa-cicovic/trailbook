import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AppleNotificationService } from "./apple-notification.service";
import { ApplePurchaseConfig } from "./apple-purchase.config";
import { ApplePurchaseProvider } from "./apple-purchase.provider";
import { APPLE_STORE_GATEWAY, AppleAppStoreGateway } from "./apple-store.gateway";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import { PurchaseApplicationService } from "./purchase-application.service";
import { PurchasesController } from "./purchases.controller";

@Module({
  imports: [AuthModule],
  controllers: [PurchasesController],
  providers: [
    AppleAppStoreGateway,
    AppleNotificationService,
    ApplePurchaseConfig,
    ApplePurchaseProvider,
    FakePurchaseProvider,
    PurchaseApplicationService,
    { provide: APPLE_STORE_GATEWAY, useExisting: AppleAppStoreGateway },
  ],
  exports: [PurchaseApplicationService],
})
export class PurchasesModule {}
