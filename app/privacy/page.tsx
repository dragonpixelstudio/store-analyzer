import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Privacy Policy | Dragon Pixel Studio",
  description: "Privacy policy for Dragon Pixel Studio uploads, algorithmic reports, and image generation features.",
};

export default function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy Policy"
      title="Privacy policy"
      intro="How Studio handles artwork, prompts, analysis reports and your credit wallet."
    >
      <p className="mb-7 text-[13px] font-medium text-[var(--text-4)]">
        Effective date: September 25, 2026
      </p>

      <PolicySection title="1. Information we collect">
        <p>We may collect the following information when you use Dragon Pixel Studio:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Uploaded game icons, screenshots, feature graphics, capsules or key art; game descriptions, generation prompts and edit instructions.</li>
          <li>Analysis outputs, scores, review text, and technical request metadata.</li>
          <li>IP address and basic request data used for security, abuse prevention, and rate limits.</li>
          <li>Email address, order details, account information, and support messages if you contact us or buy a credit pack.</li>
          <li>Payment and receipt information handled by our payment provider.</li>
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
          Gemini API, to produce reviews, new images and AI edits. Rate limiting and security tooling may use Upstash.
          Dodo Payments handles paid checkout, tax, receipts and payment support. Upstash also stores wallet balances, credit activity and payment identifiers.
        </p>
        <p>
          These providers process requests under their applicable terms and privacy policies. Do not upload highly
          confidential assets if you are not comfortable with this processing.
        </p>
      </PolicySection>

      <PolicySection title="4. Upload storage">
        <p>Background requests temporarily store your uploaded images and prompts with Upstash for up to 24 hours. Inputs are deleted after completion. Results remain available in Recent jobs for up to 24 hours and require your wallet cookie. Netlify hosts the application and processes these requests.</p>
        <p>Recent Studio artwork is saved in this browser’s local storage database (IndexedDB), up to 12 images, including editable layers for saved manual edits. Up to 12 manual-editor drafts are also saved locally. Other people using this browser profile may see it. Clearing site data removes these local images. A signed, HTTP-only cookie identifies your credit wallet; keep your private wallet recovery code to restore access after clearing cookies or changing devices.</p>
        <p>
          Analysis reports, including small image previews, are stored for shareable report links.
          Anyone with a report link can view it; it is not protected by your wallet login. Reports
          normally expire after 90 days; a featured sample may be retained longer. Original uploaded
          files are processed for the review, while wallet usage and payment records support billing,
          refunds and account limits.
        </p>
      </PolicySection>

      <PolicySection title="Artwork handoff and browser storage"><p>When you send artwork between Studio and Analyze, the image, game details and revision brief are temporarily stored in this tab’s session storage. The handoff is removed after import and stops being accepted after 30 minutes. Game name and description may also be saved in local storage for convenience. Opening a handoff does not itself submit an AI request or spend a credit.</p></PolicySection>
      <PolicySection title="5. Payments">
        <p>
          Dragon Pixel Studio does not ask you to enter card details directly on this website.
          Our payment provider (a merchant of record) will handle payment details, tax calculation,
          receipts, and payment support. The provider&apos;s own privacy
          terms apply to payment processing.
        </p>
      </PolicySection>

      <PolicySection title="Usage analytics"><p>Vercel-hosted deployments may use Vercel Analytics. We also record a limited set of product events, such as starting an analysis or finishing a generation, to understand reliability and usage. These event records do not include uploaded image content, payment card details or wallet recovery codes.</p></PolicySection>
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
