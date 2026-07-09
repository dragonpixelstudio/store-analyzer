import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Refund Policy | Dragon Pixel Store Analyzer",
  description: "Refund policy for Dragon Pixel Store Analyzer subscriptions and generation credits.",
};

export default function RefundPolicyPage() {
  return (
    <PageShell
      eyebrow="Refund Policy"
      title="Refunds for subscriptions and credits"
      intro="The free analyzer has no charge. Paid plans and generation credits are digital software access, so the refund rules are clear before purchase."
    >
      <p className="mb-7 text-[13px] font-medium text-[var(--text-4)]">
        Effective date: July 1, 2026
      </p>

      <PolicySection title="1. Free analysis">
        <p>
          The Free Analysis / Beta plan costs $0 USD. Because no payment is collected for the free
          analyzer, there is no refund needed for free use.
        </p>
      </PolicySection>

      <PolicySection title="2. Paid plans and credits">
        <p>
          Paid subscriptions provide metered analysis reports, generation credits, and export
          features. You may request a refund within 7 days of purchase by emailing the order email,
          receipt ID, and reason for the request.
        </p>
      </PolicySection>

      <PolicySection title="3. When a refund is usually available">
        <ul className="list-disc space-y-2 pl-5">
          <li>You were charged twice for the same order.</li>
          <li>You paid but account access or purchased credits were not made available.</li>
          <li>An API failure or timeout consumed credits without delivering an image variant.</li>
          <li>The paid plan materially differs from the description on the pricing page.</li>
        </ul>
      </PolicySection>

      <PolicySection title="4. When a refund may be declined">
        <ul className="list-disc space-y-2 pl-5">
          <li>Credits were used for successfully delivered generated image variants.</li>
          <li>The request is based only on a hoped-for download, ranking, approval, or revenue outcome.</li>
          <li>The generated output followed your supplied assets, prompt, and revision brief.</li>
          <li>The request is made after the 7-day refund window without a clear account, credit, or output issue.</li>
        </ul>
      </PolicySection>

      <PolicySection title="5. Payment processing">
        <p>
          Our payment provider may process approved refunds back to the original
          payment method. Bank, card, and local payment-method timelines may vary.
        </p>
      </PolicySection>

      <PolicySection title="6. How to request a refund">
        <p>
          Email{" "}
          <a className="font-bold text-[var(--cyan)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          with your order email, receipt or order ID if available, purchase date, and a short reason
          for the request.
        </p>
      </PolicySection>
    </PageShell>
  );
}
