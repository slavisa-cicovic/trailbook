import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { ApplePurchaseProvider } from "./apple-purchase.provider";
import { EntitlementService } from "./entitlement.service";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import { GooglePurchaseProvider } from "./google-purchase.provider";
import { PurchaseApplicationService } from "./purchase-application.service";
import { PurchasesController } from "./purchases.controller";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PurchasesController],
  providers: [
    ApplePurchaseProvider,
    EntitlementService,
    FakePurchaseProvider,
    GooglePurchaseProvider,
    PurchaseApplicationService,
  ],
  exports: [EntitlementService, PurchaseApplicationService],
})
export class PurchasesModule {}
