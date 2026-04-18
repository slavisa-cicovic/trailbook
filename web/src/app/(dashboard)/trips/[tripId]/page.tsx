import { Container } from "@mui/material";

import { TripDetailView } from "../../../../sections/trips/view/trip-detail-view";

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <Container maxWidth={false} sx={{ maxWidth: 1600, px: { xs: 0, md: 1 }, width: "100%" }}>
      <TripDetailView tripId={tripId} />
    </Container>
  );
}
