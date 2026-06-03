import { useEffect } from "react";

import { hydrateTripGroupMembersStore, useTripGroupMembersStore } from "../../state/trip-group-members-store";
import { hydrateTripGroupsStore, useTripGroupsStore } from "../../state/trip-groups-store";

let hydrationStarted = false;

export function useTripsScreenHydration(): boolean {
  const tripGroupsHydrated = useTripGroupsStore((s) => s.hydrated);
  const tripGroupMembersHydrated = useTripGroupMembersStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrationStarted) {
      return;
    }
    hydrationStarted = true;
    void Promise.all([hydrateTripGroupsStore(), hydrateTripGroupMembersStore()]);
  }, []);

  return tripGroupsHydrated && tripGroupMembersHydrated;
}
