import { Link } from "@mui/material";
import type { Metadata } from "next";

import { LegalPage, LegalSection } from "../../components/legal/legal-page";

export const metadata: Metadata = {
  description: "How to delete a Trailbook account and its associated data.",
  title: "Delete Your Account | Trailbook",
};

export default function DeleteAccountPage() {
  return (
    <LegalPage
      subtitle="Account and data deletion for Trailbook"
      title="Delete your Trailbook account"
    >
      <LegalSection title="Delete your account in the app">
        Sign in to Trailbook, open <strong>Settings</strong>, find the{" "}
        <strong>Account</strong> section, select <strong>Delete account</strong>, and confirm the
        deletion. Stop any active trip recording before starting. Account deletion is permanent
        and cannot be undone.
      </LegalSection>
      <LegalSection title="Request deletion without access to the app">
        Email{" "}
        <Link href="mailto:sc.trailbook@gmail.com?subject=Trailbook%20account%20deletion%20request">
          sc.trailbook@gmail.com
        </Link>{" "}
        from the email address associated with your Trailbook account and use the subject
        &quot;Trailbook account deletion request&quot;. We may ask you to verify account ownership
        before completing the request. Do not send your password, payment-card details, or identity
        documents by email.
      </LegalSection>
      <LegalSection title="Data that is deleted">
        Deleting your account removes the Trailbook account and active sessions, synchronized trips
        and recorded routes, precise trip locations, groups, waypoints, uploaded waypoint photos,
        sharing links and user-to-user shares, and the link between the account and its Premium
        purchase entitlement. Local Trailbook data on signed-in devices is removed when deletion is
        completed in the app; uninstalling the app also removes its local application data from that
        device.
      </LegalSection>
      <LegalSection title="Data that may be retained">
        Limited transaction, security, fraud-prevention, support, or audit records may be retained
        only when needed to comply with law, resolve billing or security disputes, or protect the
        service. Residual copies may remain temporarily in restricted backups until those backups
        expire under the applicable backup schedule. Retained records are not used to provide an
        active Trailbook account or for advertising.
      </LegalSection>
      <LegalSection title="Delete selected data without deleting your account">
        You can delete individual trips, waypoint photos, and sharing links from Trailbook without
        deleting your account. You may also email support to request access, correction, export, or
        deletion of particular account data.
      </LegalSection>
      <LegalSection title="Subscriptions">
        Deleting a Trailbook account does not automatically cancel a Google Play or App Store
        subscription. Cancel the subscription separately in the subscription settings of the store
        where it was purchased.
      </LegalSection>
    </LegalPage>
  );
}
