import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { TripsModule } from "./trips/trips.module";

@Module({
  imports: [DatabaseModule, HealthModule, AuthModule, PurchasesModule, TripsModule],
})
export class AppModule {}
