import type { Metadata } from "next";

import { LegalPage, LegalSection } from "../../components/legal/legal-page";

export const metadata: Metadata = {
  description: "How Trailbook processes account, trip, location, photo, and purchase information.",
  title: "Privacy Policy | Trailbook",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Trailbook Privacy Policy">
      <LegalSection title="Information we process">
        Trailbook processes account information, recorded trip routes and locations, waypoints,
        photos you attach, device and synchronization identifiers, and limited diagnostics needed
        to operate and support the service. Apple supplies purchase transaction and subscription
        status information; Trailbook does not receive your payment-card details.
      </LegalSection>
      <LegalSection title="How information is used">
        We use this information to authenticate your account, record and restore trips, synchronize
        devices, provide sharing features, verify Premium access, prevent abuse, diagnose failures,
        and answer support requests. We do not sell personal information or use trip data for
        advertising.
      </LegalSection>
      <LegalSection title="Location and photos">
        Location is collected while recording a trip, including in the background when you enable
        recording. Photos are uploaded only when you add them to a waypoint and synchronization is
        enabled. You control when recording starts and stops and which photos are attached.
      </LegalSection>
      <LegalSection title="Storage and service providers">
        Production account and trip data is hosted using Amazon Web Services in the European Union.
        Apple provides subscriptions and Sign in with Apple; Google may provide Google sign-in.
        These providers process data under their own privacy terms.
      </LegalSection>
      <LegalSection title="Sharing and retention">
        Trips are private unless you choose to share them. Shared content is available according to
        the access method you select. We retain account and synchronized content while your account
        is active and as needed for backups, security, legal obligations, and dispute resolution.
      </LegalSection>
      <LegalSection title="Your choices">
        You can stop recording, remove local trips, delete shared links, and contact us to request
        access, correction, export, or deletion of account data. Some records may be retained where
        required by law or to document purchases and security events.
      </LegalSection>
      <LegalSection title="Children and changes">
        Trailbook is not directed to children under 13. We may update this policy as the service
        changes and will publish the revised effective date on this page.
      </LegalSection>
    </LegalPage>
  );
}
