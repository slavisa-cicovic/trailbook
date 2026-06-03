import ScreenLayout from "../../src/components/layout/screen-layout";
export { ScreenErrorBoundary as ErrorBoundary } from "../../src/core/screen-error-boundary";

export default function AuthCallbackRoute() {
  return <ScreenLayout title="Completing sign-in" />;
}
