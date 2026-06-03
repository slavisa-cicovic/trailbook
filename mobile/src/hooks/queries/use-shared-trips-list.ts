import { useQuery } from "@tanstack/react-query";

import { listSharedTrips } from "../../services/trips/server-trip-sharing.service";
import { useSessionStore } from "../../state/session-store";

export function sharedTripsListQueryKey(userId: string) {
  return ["shared-trips-list", userId] as const;
}

export function useSharedTripsList() {
  const identitySession = useSessionStore((s) => s.identitySession);
  const sessionToken = identitySession?.mode === "authenticated" ? identitySession.sessionToken : null;
  const userId = identitySession?.userId ?? null;

  return useQuery({
    queryKey: sharedTripsListQueryKey(userId ?? ""),
    queryFn: () => listSharedTrips(sessionToken!),
    enabled: !!sessionToken,
    staleTime: 0,
  });
}
