import type { Metadata } from "next";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Contact | Dragon Pixel Store Analyzer",
  description: "Contact Dragon Pixel Studio for Store Analyzer support, billing, refunds, and product questions.",
};

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="Store Analyzer Support"
      intro="Use this page for account support, billing, refunds, and product questions."
    >
      <div className="rounded-2xl border border-[rgba(24,224,255,.26)] bg-[rgba(24,224,255,.055)] p-5">
        <h2 className="font-brand text-[19px] font-semibold">Email support</h2>
        <p className="mt-3 max-w-[60ch] text-[14.5px] font-medium leading-7 text-[var(--text-2)]">
          For account access, billing, credit usage, refund requests, or general support, email:
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-brand mt-4 inline-flex rounded-xl border border-[rgba(24,224,255,.35)] bg-black/25 px-4 py-3 text-sm font-semibold text-[var(--cyan)] transition hover:-translate-y-0.5 hover:bg-black/40"
        >
          {CONTACT_EMAIL}
        </a>
      </div>

      <PolicySection title="What to include">
        <ul className="list-disc space-y-2 pl-5">
          <li>Your game name and store link if available.</li>
          <li>The email used for your order or receipt.</li>
          <li>A short description of what you need help with.</li>
          <li>For refund requests, include the purchase date and reason.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Response time">
        <p>
          Dragon Pixel Studio aims to respond to support messages within 1 to 2 business days.
        </p>
      </PolicySection>
    </PageShell>
  );
}
