import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Refund Policy | Dragon Pixel Store Analyzer",
  description: "Refund policy for Dragon Pixel Store Analyzer paid reports and beta store asset packs.",
};

export default function RefundPolicyPage() {
  return (
    <PageShell
      eyebrow="Refund Policy"
      title="Refunds for paid beta services"
      intro="The free analyzer has no charge. Paid reports and store-asset services are digital services, so the refund rules are clear before purchase."
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

      <PolicySection title="2. Paid reports and store packs">
        <p>
          Paid services are manual digital services. You may request a refund within 7 days of
          purchase by emailing the order email, receipt ID, and reason for the request.
        </p>
      </PolicySection>

      <PolicySection title="3. When a refund is usually available">
        <ul className="list-disc space-y-2 pl-5">
          <li>You were charged twice for the same order.</li>
          <li>You paid but Dragon Pixel Studio cannot deliver the purchased service.</li>
          <li>You request cancellation before manual work has started.</li>
          <li>The delivered report is materially different from the paid plan description.</li>
        </ul>
      </PolicySection>

      <PolicySection title="4. When a refund may be declined">
        <ul className="list-disc space-y-2 pl-5">
          <li>The paid report or digital deliverable has already been completed and delivered.</li>
          <li>The request is based only on a hoped-for download, ranking, approval, or revenue outcome.</li>
          <li>The order cannot be completed because required assets, context, or permissions were not provided.</li>
          <li>The request is made after the 7-day refund window without a clear delivery issue.</li>
        </ul>
      </PolicySection>

      <PolicySection title="5. Paddle payment handling">
        <p>
          After Paddle checkout is enabled, Paddle may process approved refunds back to the original
          payment method. Bank, card, and local payment-method timelines may vary.
        </p>
      </PolicySection>

      <PolicySection title="6. How to request a refund">
        <p>
          Email{" "}
          <a className="font-bold text-[var(--cyan)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          with your order email, Paddle receipt ID if available, purchase date, and a short reason
          for the request.
        </p>
      </PolicySection>
    </PageShell>
  );
}
