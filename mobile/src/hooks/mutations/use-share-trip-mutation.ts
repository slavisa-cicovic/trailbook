import { useMutation, useQueryClient } from "@tanstack/react-query";

import { shareTripWithRecipient } from "../../services/trips/server-trip-sharing.service";
import { useSessionStore } from "../../state/session-store";
import { tripSharesQueryKey } from "../queries/use-trip-shares";

export function useShareTripMutation(tripId: string | null | undefined) {
  const queryClient = useQueryClient();
  const identitySession = useSessionStore((s) => s.identitySession);
  const sessionToken = identitySession?.mode === "authenticated" ? identitySession.sessionToken : null;
  const userId = identitySession?.userId ?? null;

  return useMutation({
    mutationFn: (recipientEmail: string) =>
      shareTripWithRecipient(sessionToken!, tripId!, recipientEmail),
    onSuccess: () => {
      if (tripId && userId) {
        void queryClient.invalidateQueries({ queryKey: tripSharesQueryKey(tripId, userId) });
      }
    },
  });
}
