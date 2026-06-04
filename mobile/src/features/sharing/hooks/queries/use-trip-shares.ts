import { useQuery } from "@tanstack/react-query";

import { listShareRecipients, listTripShares } from "../../../../services/trips/server-trip-sharing.service";
import { useSessionStore } from "../../../../state/session-store";

export function tripSharesQueryKey(tripId: string, userId: string) {
  return ["trip-shares", tripId, userId] as const;
}

export function shareRecipientsQueryKey(userId: string) {
  return ["share-recipients", userId] as const;
}

export function useTripShares(tripId: string | null | undefined, enabled: boolean) {
  const identitySession = useSessionStore((s) => s.identitySession);
  const sessionToken = identitySession?.mode === "authenticated" ? identitySession.sessionToken : null;
  const userId = identitySession?.userId ?? null;

  return useQuery({
    queryKey: tripSharesQueryKey(tripId ?? "", userId ?? ""),
    queryFn: () => listTripShares(sessionToken!, tripId!),
    enabled: enabled && !!sessionToken && !!tripId,
    staleTime: 0,
  });
}

export function useShareRecipients(enabled: boolean) {
  const identitySession = useSessionStore((s) => s.identitySession);
  const sessionToken = identitySession?.mode === "authenticated" ? identitySession.sessionToken : null;
  const userId = identitySession?.userId ?? null;

  return useQuery({
    queryKey: shareRecipientsQueryKey(userId ?? ""),
    queryFn: () => listShareRecipients(sessionToken!),
    enabled: enabled && !!sessionToken,
    staleTime: 1000 * 60 * 10,
  });
}
