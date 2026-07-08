import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, PolicySection } from "@/app/components/SiteChrome";

export const metadata: Metadata = {
  title: "Pricing | Dragon Pixel Store Analyzer",
  description:
    "Pricing for Dragon Pixel Store Analyzer analysis reports, generation credits, and AI store asset fixes.",
};

const plans = [
  {
    name: "Free",
    price: "$0",
    cadence: "USD",
    note: "For testing the full loop.",
    bullets: [
      "3 analysis reports per day",
      "Score, priority fixes, and revision brief on every report",
      "3 generation credits, one-time",
      "Preview-size generated exports",
          ],
    href: "/",
    cta: "Analyze your assets free",
    microcopy: "No card required.",
  },
  {
    name: "Indie",
    price: "$19",
    cadence: "USD / month",
    note: "For polishing one game's store page.",
    bullets: [
      "50 generation credits per month",
      "100 analysis reports per month",
            "Icon, screenshot, feature graphic, and capsule generation",
            "Credit cost shown before every generation",
      "Failed generations never use credits",
    ],
    href: "/contact",
    cta: "Start polishing your page",
    microcopy: "Cancel anytime. Monthly credits reset each billing cycle.",
    featured: true,
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "USD / month",
    note: "For multiple titles or client launch work.",
    bullets: [
      "200 generation credits per month",
      "500 analysis reports per month",
      "Everything in Indie",
                            ],
    href: "/contact",
    cta: "Go Pro",
    microcopy: "Cancel anytime.",
  },
];

const topUps = [
  { credits: "25 credits", price: "$12" },
  { credits: "100 credits", price: "$39" },
  { credits: "250 credits", price: "$79" },
];

const oneTimeFix = {
  name: "Quick Fix",
  price: "$5",
  cadence: "USD one-time",
  credits: "6 generation credits",
  detail:
    "Best when you only need one icon, screenshot, capsule, or feature graphic improved and do not want a monthly plan.",
};

export default function PricingPage() {
  return (
    <PageShell
      eyebrow="Pricing"
      title="Simple pricing for reports, credits, and generated variants."
      intro="Analysis reports are metered by plan. Credits are only used when the AI generates an improved asset for you. One credit equals one generated variant."
    >
      <div className="mb-7 rounded-2xl border border-[rgba(105,255,0,.28)] bg-[rgba(105,255,0,.055)] p-5">
        <p className="text-[14.5px] font-semibold leading-7 text-[var(--text-2)]">
          The meter only runs on delivered images. API errors, timeouts, and blocked requests
          never use credits, and the app shows the exact credit cost before every generation.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.name}
            className="flex flex-col rounded-2xl border p-5"
            style={{
              borderColor: plan.featured ? "rgba(255,194,61,.44)" : "var(--edge)",
              background: plan.featured ? "rgba(255,194,61,.06)" : "rgba(255,255,255,.025)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="font-brand text-[18px] font-semibold">{plan.name}</h2>
              {plan.featured && (
                <span className="font-brand rounded-full border border-[rgba(255,194,61,.4)] bg-[rgba(255,194,61,.1)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--gold)]">
                  Most popular
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
              <span className="ml-2 text-[13px] font-medium text-[var(--text-3)]">
                {plan.cadence}
              </span>
            </div>

            <p className="mt-2 text-[13.5px] font-medium leading-6 text-[var(--text-2)]">
              {plan.note}
            </p>

            <ul className="mt-5 flex flex-1 flex-col gap-2.5">
              {plan.bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-start gap-2 text-[13.5px] font-medium text-[var(--text-2)]"
                >
                  <span className="font-brand mt-px flex-none font-semibold text-[var(--green)]">
                    +
                  </span>
                  <span className="leading-snug">{bullet}</span>
                </li>
              ))}
            </ul>

            {plan.featured && (
              <p className="mt-5 rounded-xl border border-[rgba(255,194,61,.22)] bg-black/20 p-3 text-[12.5px] font-medium leading-5 text-[var(--text-3)]">
                50 credits is roughly one full launch pass: icon variants, screenshot fixes,
                feature graphics, capsules, and room to experiment.
              </p>
            )}

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
            <p className="mt-2 text-center text-[12px] font-medium text-[var(--text-4)]">
              {plan.microcopy}
            </p>
          </article>
        ))}
      </div>

      <PolicySection title="One-time image fix">
        <div className="rounded-2xl border border-[rgba(24,215,255,.26)] bg-[#0d1423] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-brand text-[18px] font-semibold text-[var(--foreground)]">
                {oneTimeFix.name}
              </h2>
              <p className="mt-2 max-w-[720px] text-[14px] font-medium leading-6 text-[var(--text-2)]">
                {oneTimeFix.detail}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <div className="font-score text-[34px] font-black text-[var(--cyan)]">
                {oneTimeFix.price}
              </div>
              <div className="text-[12.5px] font-semibold text-[var(--text-3)]">
                {oneTimeFix.cadence}
              </div>
            </div>
          </div>
          <p className="mt-4 rounded-xl border border-[var(--edge)] bg-black/20 p-3 text-[13px] font-semibold leading-6 text-[var(--text-2)]">
            Includes {oneTimeFix.credits}. A typical Fix with AI click produces 2 variants,
            so this is enough for up to three focused generation attempts. It is intentionally
            higher per credit than Indie or Pro, so monthly plans remain the better choice for
            a full store-page polish.
          </p>
        </div>
      </PolicySection>

      <PolicySection title="Generation credit top-ups">
        <p>
          Ran out mid-launch? Top up without changing plans. Top-ups are available on Indie
          and Pro plans.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {topUps.map((item) => (
            <div key={item.credits} className="rounded-xl border border-[var(--edge)] bg-[#0d1423] p-4">
              <div className="font-brand text-[15px] font-semibold text-[var(--foreground)]">
                {item.credits}
              </div>
              <div className="font-score mt-2 text-[28px] font-black text-[var(--cyan)]">
                {item.price}
              </div>
            </div>
          ))}
        </div>
        <p>
          Purchased credits do not expire while your account remains active. Monthly plans stay
          the better per-credit value.
        </p>
      </PolicySection>

      <PolicySection title="Mini FAQ">
        <p>
          <strong>What costs a credit?</strong> One successfully generated image variant. A
          typical Fix with AI click produces 2 variants, so it costs 2 credits, shown before
          you click. Exports and resizing are free once an image exists.
        </p>
        <p>
          <strong>What if I only need one image?</strong> Use Quick Fix: $5 USD one-time for
          6 generation credits, enough for a few focused variants without starting a subscription.
        </p>
        <p>
          <strong>Do analysis reports cost credits?</strong> No. Reports are metered by plan:
          3 per day on Free, 100 per month on Indie, and 500 per month on Pro.
        </p>
        <p>
          <strong>What can the AI generate?</strong> Improved versions of your game&apos;s icons,
          screenshots, capsules, and feature graphics. It improves composition, readability,
          text hierarchy, and contrast while preserving your game&apos;s art and branding. It cannot
          generate people, faces, likenesses, NSFW content, or other studios&apos; IP.
        </p>
        <p>
          <strong>Can I cancel anytime?</strong> Yes, effective at the end of the billing
          period. Payments, receipts, and taxes are handled by our merchant of record.
        </p>
      </PolicySection>
    </PageShell>
  );
}
