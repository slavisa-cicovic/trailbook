import { Container } from "@mui/material";

import { TripsListView } from "../../../sections/trips/view/trips-list-view";

export default function TripsPage() {
  return (
    <Container maxWidth="lg" sx={{ px: { xs: 0, md: 1 } }}>
      <TripsListView />
    </Container>
  );
}
