import { tripsController } from "../features/trips/trips.controller";
import { tripsService } from "../features/trips/trips.service";

export const appModule = {
  controllers: [tripsController],
  providers: [tripsService],
};
