import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { TripGroupsController } from "./trip-groups.controller";
import { TripGroupsService } from "./trip-groups.service";

@Module({
  imports: [DatabaseModule, AuthModule, PurchasesModule],
  controllers: [TripGroupsController],
  providers: [TripGroupsService],
})
export class TripGroupsModule {}
