import type { Metadata } from "next";

import { SharedTripView } from "../../../../sections/shared-trips/shared-trip-view";

interface SharedTripPageProps {
  params: Promise<{ token: string }>;
}

export const metadata: Metadata = {
  title: "Trailbook shared trip",
  description: "A PIN-protected Trailbook shared trip.",
  openGraph: {
    title: "Trailbook shared trip",
    description: "Open this PIN-protected shared trip in Trailbook web.",
    type: "article",
  },
  twitter: {
    card: "summary",
    title: "Trailbook shared trip",
    description: "Open this PIN-protected shared trip in Trailbook web.",
  },
};

export default async function SharedTripPage({ params }: SharedTripPageProps) {
  const { token } = await params;
  return <SharedTripView token={token} />;
}
