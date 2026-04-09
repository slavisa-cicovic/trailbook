import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { UsersModule } from "../users/users.module";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";

@Module({
  imports: [DatabaseModule, UsersModule, AuthModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
