import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Pricing | Dragon Pixel Store Analyzer",
  description:
    "Pricing for Dragon Pixel Store Analyzer free beta analysis and paid store creative reports.",
};

const plans = [
  {
    name: "Free Analysis / Beta",
    price: "$0",
    cadence: "USD",
    note: "Free while beta access is open.",
    bullets: [
      "Upload one game icon and up to three screenshots",
      "Conversion-risk review for shelf readability, click pull, clarity, and polish",
      "Prioritized what-to-fix list",
      "No payment required",
    ],
    href: "/",
    cta: "Start free analysis",
  },
  {
    name: "Paid Store Report",
    price: "$29",
    cadence: "USD one-time",
    note: "A manual written report for teams that want a deeper launch read.",
    bullets: [
      "Detailed review of icon, screenshots, and store creative",
      "Specific recommendations for headlines, focal points, ordering, and visual clarity",
      "Before/after direction notes for the highest-risk assets",
      "Delivered by email within 2 business days",
    ],
    href: "/contact",
    cta: "Request paid report",
    featured: true,
  },
  {
    name: "Store Asset Pack",
    price: "$79",
    cadence: "USD one-time beta",
    note: "Manual creative help for the weak spots found in the analyzer.",
    bullets: [
      "Icon polish direction plus up to five screenshot layout recommendations",
      "Feature graphic or capsule direction when supplied",
      "Outcome-framed copy and store screenshot headline guidance",
      "Delivered as a beta service by Dragon Pixel Studio",
    ],
    href: "/contact",
    cta: "Request store pack",
  },
];

export default function PricingPage() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="Store creative review pricing"
      intro="Clear one-time pricing for the current beta. The free analyzer stays free; paid work is for manual reports and store-asset guidance based on your real game assets."
    >
      <div className="mb-7 rounded-2xl border border-[rgba(24,224,255,.26)] bg-[rgba(24,224,255,.055)] p-5">
        <p className="text-[14.5px] font-medium leading-7 text-[var(--text-2)]">
          All prices are listed in USD. During the beta, paid options are one-time purchases,
          not subscriptions. Paddle will process checkout, receipts, taxes, and payment support
          after domain verification is complete.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className="flex flex-col rounded-2xl border p-5"
            style={{
              borderColor: plan.featured ? "rgba(255,194,61,.44)" : "var(--edge)",
              background: plan.featured ? "rgba(255,194,61,.05)" : "rgba(255,255,255,.025)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-brand text-[18px] font-semibold">{plan.name}</h2>
              {plan.featured && (
                <span className="font-brand rounded-full border border-[rgba(255,194,61,.4)] bg-[rgba(255,194,61,.1)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--gold)]">
                  Paid report
                </span>
              )}
            </div>
            <div className="mt-4">
              <span
                className="font-score text-[38px] font-black"
                style={{ color: plan.featured ? "var(--gold)" : "var(--cyan)" }}
              >
                {plan.price}
              </span>
              <span className="ml-2 text-[13px] font-medium text-[var(--text-3)]">{plan.cadence}</span>
            </div>
            <p className="mt-2 text-[13.5px] font-medium leading-6 text-[var(--text-2)]">{plan.note}</p>
            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {plan.bullets.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2 text-[13.5px] font-medium text-[var(--text-2)]">
                  <span className="font-brand mt-px flex-none font-semibold text-[var(--green)]">+</span>
                  <span className="leading-snug">{bullet}</span>
                </li>
              ))}
            </ul>
            <Link
              href={plan.href}
              className="font-brand mt-6 inline-flex min-h-[46px] items-center justify-center rounded-xl text-[13px] font-semibold transition hover:-translate-y-0.5 hover:brightness-110"
              style={
                plan.featured
                  ? { background: "linear-gradient(120deg,var(--gold),#ff8a3d)", color: "#1a1205" }
                  : { background: "linear-gradient(120deg,var(--cyan),var(--magenta))", color: "#05121a" }
              }
            >
              {plan.cta}
            </Link>
          </article>
        ))}
      </div>

      <PolicySection title="What you receive">
        <p>
          The free analyzer gives an instant conversion review for uploaded store assets. Paid
          reports add a deeper manual pass from Dragon Pixel Studio with practical recommendations
          you can apply to your app store, Google Play, Steam, or itch page creative.
        </p>
        <p>
          The Store Asset Pack is a beta manual service. It focuses on fixing the same weak spots
          surfaced by the analyzer: readability, visual hierarchy, click pull, gameplay clarity,
          and screenshot copy.
        </p>
      </PolicySection>

      <PolicySection title="How delivery works">
        <p>
          After Paddle checkout is enabled, paid customers will receive an order confirmation and
          delivery instructions. Until the checkout is active, use the contact page to request the
          paid report or store pack manually.
        </p>
        <p>
          Questions before ordering? Email{" "}
          <a className="font-bold text-[var(--cyan)] hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </PolicySection>
    </PageShell>
  );
}
