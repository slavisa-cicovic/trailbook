import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { SharedTripsController } from "./shared-trips.controller";
import { TripsController } from "./trips.controller";
import { TripsService } from "./trips.service";
import { WaypointImagesController } from "./waypoint-images.controller";
import { WaypointImagesService } from "./waypoint-images.service";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [TripsController, WaypointImagesController, SharedTripsController],
  providers: [TripsService, WaypointImagesService],
})
export class TripsModule {}
