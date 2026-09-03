import type { Metadata } from "next";

import { LandingPage } from "../components/public/landing-page";

export const metadata: Metadata = {
  title: "Trailbook — Svaki put ostavlja trag",
  description: "Beležite rute, važna mesta i fotografije sa putovanja, izviđačkih akcija i rada na terenu.",
};

export default function HomePage() {
  return <LandingPage />;
}
