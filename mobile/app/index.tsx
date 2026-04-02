import { Redirect } from "expo-router";

import { useSessionStore } from "../src/state/session-store";

export default function IndexRoute() {
  const hasSession = useSessionStore((state) => Boolean(state.identitySession));

  return <Redirect href={hasSession ? "/recording" : "/login"} />;
}
