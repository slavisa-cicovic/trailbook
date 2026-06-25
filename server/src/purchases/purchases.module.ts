import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FakePurchaseProvider } from "./fake-purchase.provider";
import { PurchaseApplicationService } from "./purchase-application.service";
import { PurchasesController } from "./purchases.controller";

@Module({
  imports: [AuthModule],
  controllers: [PurchasesController],
  providers: [FakePurchaseProvider, PurchaseApplicationService],
  exports: [PurchaseApplicationService],
})
export class PurchasesModule {}
