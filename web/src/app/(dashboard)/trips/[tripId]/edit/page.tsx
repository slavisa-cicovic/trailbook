import { Container } from "@mui/material";

import { TripEditView } from "../../../../../sections/trips/view/trip-edit-view";

export default async function TripEditPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1800, px: { xs: 0, md: 1 }, width: "100%" }}>
      <TripEditView tripId={tripId} />
    </Container>
  );
}
