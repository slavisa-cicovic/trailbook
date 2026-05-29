import { resolveSessionFlags } from "../../constants/feature-flags";
import { useSessionStore } from "../../state/session-store";

export function useFeatureFlags() {
  const identitySession = useSessionStore((s) => s.identitySession);
  return resolveSessionFlags(identitySession);
}
