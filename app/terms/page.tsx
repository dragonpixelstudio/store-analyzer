import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Terms of Service | Dragon Pixel Studio",
  description: "Terms of service for Dragon Pixel Studio: algorithmic asset reports, edit plans, and artwork credits.",
};

export default function TermsPage() {
  return (
    <PageShell
      eyebrow="Terms of Service"
      title="Terms of service"
      intro="These terms explain how analysis reports, one-time credit packs, and AI store artwork work."
    >
      <p className="mb-7 text-[13px] font-medium text-[var(--text-4)]">
        Effective date: October 6, 2026
      </p>

      <PolicySection title="1. Agreement">
        <p>
          These Terms of Service apply to Dragon Pixel Studio, available at
          launch.dragonpixelstudio.com, and related software features provided by Dragon Pixel
          Studio. By using the site or buying a credit pack, you agree to these terms.
        </p>
      </PolicySection>

      <PolicySection title="2. What the service does">
        <p>
          Dragon Pixel Studio creates icons, capsules and thumbnails, frames real gameplay, and reviews store creative for potential communication issues
          such as readability, click pull, gameplay clarity, emotional signal, and visual polish.
          The analyzer provides automated reports, priority fixes, and revision briefs. Credit packs
          pay for generated images, AI edits and optional extra reviews. Resizing, exports, and gameplay screenshot layouts are free.
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
          Available one-time credit packs are listed on the pricing page in USD.
          Checkout, receipts, taxes, and payment support are handled by our payment provider (a
          merchant of record). The provider&apos;s name may appear on your
          payment statement.
        </p>
        <p>
          Credit packs do not renew automatically, and purchased credits do not expire. Any legacy
          subscription remains subject to its original purchase terms; new subscriptions are not offered here.
        </p>
      </PolicySection>

      <PolicySection title="5. Credits and generated outputs">
        <p>
          One credit pays for one delivered image or AI edit. Credits are reserved while work runs;
          failed work returns the reservation. Interrupted requests recover when the wallet is checked
          after 15 minutes. Scores do not guarantee improvement or change the cost of delivered work.
          Three reviews per day are free, shared by wallet and network, resetting at 00:00 UTC. After the free allowance, an extra review costs one credit only with your confirmation. Failed reviews return their free slot or reserved credit. Provider capacity and abuse limits still apply.
        </p>
      </PolicySection>

      <PolicySection title="Wallet access and local artwork"><p>Save your private recovery code before buying credits. It restores access to the credit wallet; an email address alone does not. Recent artwork is kept on the current browser, up to 12 images, and is not restored by the wallet code. Keep downloaded copies of work you want to retain.</p><p>AI-generated outputs may contain errors or resemble existing material. Review the result and applicable platform requirements before publishing. We do not promise exclusive rights or platform approval.</p></PolicySection>
      <PolicySection title="6. Acceptable use">
        <p>
          You agree not to misuse the service, bypass rate limits, upload malware, attack the site,
          scrape non-public systems, or use the analyzer to process content that violates laws or
          platform rules. Explicit sexual content is not permitted. Screenshot tools must not be used to misrepresent actual gameplay.
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
          Dragon Pixel Studio is a beta product and may change, pause, or improve over time. Dragon
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
