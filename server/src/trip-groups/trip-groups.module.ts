import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TripGroupsController } from "./trip-groups.controller";
import { TripGroupsService } from "./trip-groups.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TripGroupsController],
  providers: [TripGroupsService],
})
export class TripGroupsModule {}
