import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Contact | Dragon Pixel Store Analyzer",
  description: "Contact Dragon Pixel Studio for Store Analyzer support, paid reports, and billing questions.",
};

export default function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="Talk to Dragon Pixel Studio"
      intro="Use this page for paid report requests, Paddle verification questions, delivery issues, refunds, and support."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[rgba(24,224,255,.26)] bg-[rgba(24,224,255,.055)] p-5">
          <h2 className="font-brand text-[19px] font-semibold">Email support</h2>
          <p className="mt-3 text-[14.5px] font-medium leading-7 text-[var(--text-2)]">
            For orders, paid reports, billing, refund requests, or general support, email:
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="font-brand mt-4 inline-flex rounded-xl border border-[rgba(24,224,255,.35)] bg-black/25 px-4 py-3 text-sm font-semibold text-[var(--cyan)] transition hover:-translate-y-0.5 hover:bg-black/40"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="rounded-2xl border border-[var(--edge)] bg-white/[.025] p-5">
          <h2 className="font-brand text-[19px] font-semibold">Useful links</h2>
          <div className="mt-4 grid gap-2 text-[14px] font-medium text-[var(--text-2)]">
            <Link href="/pricing" className="rounded-xl border border-white/10 px-4 py-3 transition hover:text-[var(--cyan)]">
              Pricing and paid plans
            </Link>
            <Link href="/refund-policy" className="rounded-xl border border-white/10 px-4 py-3 transition hover:text-[var(--cyan)]">
              Refund policy
            </Link>
            <Link href="/privacy" className="rounded-xl border border-white/10 px-4 py-3 transition hover:text-[var(--cyan)]">
              Privacy policy
            </Link>
            <a
              href="https://www.dragonpixelstudio.com/contact.html"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 px-4 py-3 transition hover:text-[var(--cyan)]"
            >
              Main studio contact page
            </a>
          </div>
        </div>
      </div>

      <PolicySection title="What to include">
        <ul className="list-disc space-y-2 pl-5">
          <li>Your game name and store link if available.</li>
          <li>The email used for your order or Paddle receipt.</li>
          <li>A short description of what you need help with.</li>
          <li>For refund requests, include the purchase date and reason.</li>
        </ul>
      </PolicySection>

      <PolicySection title="Response time">
        <p>
          Dragon Pixel Studio aims to respond to support and paid-service messages within 1 to 2
          business days.
        </p>
      </PolicySection>
    </PageShell>
  );
}
