import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { PurchasesModule } from "../purchases/purchases.module";
import { UsersModule } from "../users/users.module";
import { MediaStorageService } from "./media-storage.service";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule, PurchasesModule],
  controllers: [TripsController],
  providers: [TripsService, MediaStorageService],
})
export class TripsModule {}
