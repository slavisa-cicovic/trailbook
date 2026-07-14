import type { Metadata } from "next";

import { LegalPage, LegalSection } from "../../components/legal/legal-page";

export const metadata: Metadata = {
  description: "Terms governing the use of Trailbook and Trailbook Premium subscriptions.",
  title: "Terms of Use | Trailbook",
};

export default function TermsOfUsePage() {
  return (
    <LegalPage title="Trailbook Terms of Use">
      <LegalSection title="Using Trailbook">
        You may use Trailbook to record and organize your own trips and to share content you have
        the right to share. You are responsible for your account, device safety, backups of local-only
        content, and compliance with applicable laws. Do not rely on Trailbook as an emergency,
        navigation, rescue, or life-safety service.
      </LegalSection>
      <LegalSection title="Pre-purchase access">
        An eligible signed-in user may create one local test trip with up to three photos before
        subscribing. The test trip does not include cloud synchronization, restore, sharing, or web
        access. Further recording requires an active Premium entitlement.
      </LegalSection>
      <LegalSection title="Subscriptions">
        Trailbook Premium is offered as monthly and yearly auto-renewing Apple subscriptions. The
        App Store purchase sheet displays the localized price, billing period, and any introductory
        offer for which Apple determines you are eligible. Payment is charged to your Apple Account.
        Subscriptions renew automatically unless canceled through Apple before renewal. Canceling
        stops future renewal; Premium remains available until the verified end of the paid period.
      </LegalSection>
      <LegalSection title="Your content">
        You retain ownership of your trip content. You grant Trailbook the limited permission needed
        to store, process, synchronize, and display that content to you and to people with whom you
        choose to share it. You must not upload unlawful, infringing, or harmful content.
      </LegalSection>
      <LegalSection title="Availability and changes">
        We work to keep Trailbook available but do not guarantee uninterrupted operation, perfect GPS
        accuracy, or permanent availability of any feature. We may change or discontinue features to
        improve safety, security, compliance, or service quality.
      </LegalSection>
      <LegalSection title="Account suspension and termination">
        We may restrict accounts used for abuse, unauthorized access, fraud, or serious violations of
        these terms. You may stop using Trailbook at any time; deleting the app does not cancel an
        Apple subscription.
      </LegalSection>
      <LegalSection title="Disclaimer">
        Trailbook is provided on an as-available basis to the extent permitted by law. Outdoor travel
        carries inherent risks, and you remain responsible for route decisions, local conditions,
        permissions, equipment, and personal safety.
      </LegalSection>
    </LegalPage>
  );
}
