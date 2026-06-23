import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";
import { WaypointImagesController } from "./waypoint-images.controller";
import { WaypointImagesService } from "./waypoint-images.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TripsController, WaypointImagesController],
  providers: [TripsService, WaypointImagesService],
})
export class TripsModule {}
