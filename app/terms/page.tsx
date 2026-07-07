import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Terms of Service | Dragon Pixel Store Analyzer",
  description: "Terms of service for Dragon Pixel Store Analyzer analysis reports and AI generation credits.",
};

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="Terms of Service"
      title="Terms for using Store Analyzer"
      intro="These terms explain how analysis reports, generation credits, subscriptions, and AI store asset fixes work."
    >
      <p className="mb-7 text-[13px] font-medium text-[var(--text-4)]">
        Effective date: July 1, 2026
      </p>

      <PolicySection title="1. Agreement">
        <p>
          These Terms of Service apply to Dragon Pixel Store Analyzer, available at
          launch.dragonpixelstudio.com, and related software features provided by Dragon Pixel
          Studio. By using the site or buying a paid plan, you agree to these terms.
        </p>
      </PolicySection>

      <PolicySection title="2. What the service does">
        <p>
          Store Analyzer reviews game icons, screenshots, and store creative for conversion risks
          such as readability, click pull, gameplay clarity, emotional signal, and visual polish.
          The analyzer provides automated reports, priority fixes, and revision briefs. Paid plans
          include metered analysis reports and generation credits for AI-created asset variants.
        </p>
        <p>
          The service does not guarantee app store approval, downloads, rankings, revenue, ad
          performance, or platform featuring.
        </p>
      </PolicySection>

      <PolicySection title="3. Your uploads and rights">
        <p>
          You keep ownership of your game, artwork, screenshots, trademarks, and other submitted
          materials. You give Dragon Pixel Studio permission to process those materials only as
          needed to provide analysis, generated variants, exports, support, and account records.
        </p>
        <p>
          You are responsible for making sure you have the rights to upload and use the assets you
          submit. Do not upload confidential third-party material, unlawful content, or assets you
          are not allowed to share.
        </p>
      </PolicySection>

      <PolicySection title="4. Payments">
        <p>
          Paid plans, subscriptions, and credit top-ups are listed on the pricing page in USD.
          Paddle will process checkout, receipts, taxes, and payment support after checkout is
          enabled for the site. Paddle may appear on your payment statement.
        </p>
        <p>
          Subscription plans renew monthly unless cancelled. Monthly plan credits reset each
          billing cycle. Purchased top-up credits remain available while your account is active.
        </p>
      </PolicySection>

      <PolicySection title="5. Credits and generated outputs">
        <p>
          Generation credits are used only for successfully delivered image variants. API errors,
          timeouts, and blocked requests do not consume credits. Analysis reports do not consume
          generation credits, but they are metered by plan.
        </p>
      </PolicySection>

      <PolicySection title="6. Acceptable use">
        <p>
          You agree not to misuse the service, bypass rate limits, upload malware, attack the site,
          scrape non-public systems, or use the analyzer to process content that violates laws or
          platform rules.
        </p>
      </PolicySection>

      <PolicySection title="7. Refunds">
        <p>
          Refunds are handled under the Refund Policy. In general, eligible refund requests should
          be sent within 7 days of purchase with the order email, receipt ID, and reason for the
          request.
        </p>
      </PolicySection>

      <PolicySection title="8. Changes and availability">
        <p>
          Store Analyzer is a beta product and may change, pause, or improve over time. Dragon
          Pixel Studio may update these terms when the product, pricing, or payment flow changes.
        </p>
      </PolicySection>

      <PolicySection title="9. Contact">
        <p>
          For terms, billing, or service questions, email{" "}
          <a className="font-bold text-[var(--cyan)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PolicySection>
    </PageShell>
  );
}
