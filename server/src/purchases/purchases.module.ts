import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import { PurchaseApplicationService } from "./purchase-application.service";
import { PurchasesController } from "./purchases.controller";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [PurchasesController],
  providers: [FakePurchaseProvider, PurchaseApplicationService],
  exports: [PurchaseApplicationService],
})
export class PurchasesModule {}
