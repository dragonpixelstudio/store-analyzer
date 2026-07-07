import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Privacy Policy | Dragon Pixel Store Analyzer",
  description: "Privacy policy for Dragon Pixel Store Analyzer uploads, reports, and AI generation features.",
};

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy Policy"
      title="How Store Analyzer handles data"
      intro="The analyzer needs your uploaded assets to generate a useful review. This policy explains what is collected, why, and how it is used."
    >
      <p className="mb-7 text-[13px] font-medium text-[var(--text-4)]">
        Effective date: July 1, 2026
      </p>

      <PolicySection title="1. Information we collect">
        <p>We may collect the following information when you use Store Analyzer:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Uploaded game icons, screenshots, feature graphics, capsules, or key art.</li>
          <li>Analysis outputs, scores, review text, and technical request metadata.</li>
          <li>IP address and basic request data used for security, abuse prevention, and rate limits.</li>
          <li>Email address, order details, account information, and support messages if you contact us or buy a paid plan.</li>
          <li>Payment and receipt information handled by Paddle after checkout is enabled.</li>
        </ul>
      </PolicySection>

      <PolicySection title="2. How we use information">
        <p>We use collected information to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Generate the store creative analysis you requested.</li>
          <li>Generate improved asset variants, exports, and saved project views.</li>
          <li>Respond to support, billing, refund, and product questions.</li>
          <li>Protect the service from misuse, spam, high-volume abuse, or technical failures.</li>
          <li>Improve the clarity and reliability of the analyzer.</li>
        </ul>
      </PolicySection>

      <PolicySection title="3. AI and service providers">
        <p>
          Uploaded assets and prompt context may be sent to AI analysis providers, currently Google
          Gemini API, to produce the review. Rate limiting and security tooling may use Upstash.
          Paid checkout and payment support will be handled by Paddle once enabled.
        </p>
        <p>
          These providers process data only as needed to support the service. Do not upload highly
          confidential assets if you are not comfortable with this processing.
        </p>
      </PolicySection>

      <PolicySection title="4. Upload storage">
        <p>
          The free analyzer is designed to use uploaded files for the current review request. It
          does not intentionally publish your uploaded images or store them as public assets.
          Paid plan features may require retaining submitted materials, generated variants, project
          settings, and usage records so saved projects, exports, support, refunds, and account
          limits work correctly.
        </p>
      </PolicySection>

      <PolicySection title="5. Payments">
        <p>
          Dragon Pixel Studio does not ask you to enter card details directly on this website.
          Paddle will handle payment details, tax calculation, receipts, and payment support after
          checkout is enabled. Paddle&apos;s own privacy terms apply to payment processing.
        </p>
      </PolicySection>

      <PolicySection title="6. Data retention">
        <p>
          Analysis request data is kept only as long as needed for operation, debugging, security,
          and service improvement. Paid account records, support messages, invoices, credit usage,
          and generated-output records may be retained for business, tax, refund, and dispute
          handling reasons.
        </p>
      </PolicySection>

      <PolicySection title="7. Your choices">
        <p>
          You can ask to access, correct, or delete personal information associated with your
          support or paid account records, subject to legal, security, and accounting requirements.
          To make a request, contact us by email.
        </p>
      </PolicySection>

      <PolicySection title="8. Contact">
        <p>
          For privacy questions, email{" "}
          <a className="font-bold text-[var(--cyan)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PolicySection>
    </PageShell>
  );
}
