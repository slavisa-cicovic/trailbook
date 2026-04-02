import type { SyncTripDto } from "./dto/sync-trip.dto";
import { tripsService } from "./trips.service";

export const tripsController = {
  syncTrip(payload: SyncTripDto) {
    return tripsService.syncTrip(payload);
  },
  listTrips() {
    return tripsService.listTrips();
  },
};
