import { Container } from "@mui/material";

import { DashboardAuthPanel } from "../../components/auth/dashboard-auth-panel";

export default function DashboardPage() {
  return (
    <Container maxWidth="md" sx={{ py: 8 }}>
      <DashboardAuthPanel />
    </Container>
  );
}
