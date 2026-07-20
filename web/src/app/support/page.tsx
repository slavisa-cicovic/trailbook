import type { Metadata } from "next";

import { LegalPage, LegalSection } from "../../components/legal/legal-page";

export const metadata: Metadata = {
  description: "Contact Trailbook support for account, trip, sync, and subscription assistance.",
  title: "Support | Trailbook",
};

export default function SupportPage() {
  return (
    <LegalPage
      subtitle="Help with Trailbook accounts, trips, synchronization, and subscriptions"
      title="Trailbook Support"
    >
      <LegalSection title="Contact support">
        Email sc.trailbook@gmail.com and include the email address used for your Trailbook account,
        your device model, app version, and a short description of the problem. Do not send
        passwords, Apple Account credentials, or payment-card information.
      </LegalSection>
      <LegalSection title="Subscriptions and purchases">
        You can manage or cancel an Apple subscription from your App Store account settings. Use
        Restore purchases on the Trailbook Premium screen when an existing Apple subscription is
        not reflected in the app. Apple handles billing and refund decisions.
      </LegalSection>
      <LegalSection title="Trips, sync, and restore">
        Keep the app open and connected while a large trip or photo collection synchronizes. When
        reporting a sync or restore issue, include the trip name and approximate time of the last
        successful operation, but do not send private route or location data unless requested.
      </LegalSection>
    </LegalPage>
  );
}
