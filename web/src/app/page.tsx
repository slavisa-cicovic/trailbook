import type { Metadata } from "next";

import { LandingPage } from "../components/public/landing-page";

export const metadata: Metadata = {
  title: "Trailbook — Every journey leaves a trail",
  description: "Record routes, meaningful places, and photos from travels, scouting adventures, and field work.",
};

export default function HomePage() {
  return <LandingPage />;
}
