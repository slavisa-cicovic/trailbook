import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";
import { TripsModule } from "./trips/trips.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [DatabaseModule, HealthModule, AuthModule, UsersModule, TripsModule, AdminModule],
})
export class AppModule {}
