import { useQuery } from "@tanstack/react-query";

import { getSharedTrip } from "../../../../services/trips/server-trip-sharing.service";
import { useSessionStore } from "../../../../state/session-store";

export function sharedTripQueryKey(shareId: string, userId: string) {
  return ["shared-trip", shareId, userId] as const;
}

export function useSharedTrip(shareId: string | null | undefined) {
  const identitySession = useSessionStore((s) => s.identitySession);
  const sessionToken = identitySession?.mode === "authenticated" ? identitySession.sessionToken : null;
  const userId = identitySession?.userId ?? null;

  return useQuery({
    queryKey: sharedTripQueryKey(shareId ?? "", userId ?? ""),
    queryFn: () => getSharedTrip(sessionToken!, shareId!),
    enabled: !!sessionToken && !!shareId,
  });
}
