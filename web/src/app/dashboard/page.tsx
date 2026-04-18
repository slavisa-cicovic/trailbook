import { Container } from "@mui/material";

import { AdminDashboardView } from "../../sections/dashboard/view/admin-dashboard-view";

export default function DashboardPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 8 }}>
      <AdminDashboardView />
    </Container>
  );
}
