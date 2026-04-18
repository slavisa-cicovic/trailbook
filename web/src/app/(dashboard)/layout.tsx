import type { PropsWithChildren } from "react";

import { TrailbookDashboardLayout } from "../../layouts/dashboard/trailbook-dashboard-layout";

export default function DashboardRouteGroupLayout({ children }: PropsWithChildren) {
  return <TrailbookDashboardLayout>{children}</TrailbookDashboardLayout>;
}
