"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AccountStatus = {
  account?: { plan?: string; isSubscriber?: boolean };
  credits?: { remaining?: number };
};

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [checks, setChecks] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      let activatedNow = false;
      try {
        const res = await fetch("/api/account/status", { cache: "no-store" });
        const data = (await res.json()) as AccountStatus;
        if (!cancelled) {
          setStatus(data);
          const credits = data?.credits?.remaining ?? 0;
          const plan = data?.account?.plan ?? "free";
          activatedNow = credits > 3 || plan === "indie" || plan === "pro";
        }
      } catch {
        // Keep polling; webhook delivery can lag for a few seconds.
      } finally {
        if (!cancelled) {
          setChecks((n) => n + 1);
          if (!activatedNow) timer = setTimeout(poll, 2000);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const credits = status?.credits?.remaining ?? 0;
  const plan = status?.account?.plan ?? "free";
  const activated = credits > 3 || plan === "indie" || plan === "pro";

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-16 text-[var(--foreground)]">
      <section className="mx-auto max-w-2xl rounded-2xl border border-[var(--edge)] bg-[#0d1423] p-6">
        <p className="font-brand text-[12px] font-semibold uppercase tracking-[.16em] text-[var(--green)]">
          Checkout complete
        </p>
        <h1 className="font-brand mt-3 text-[32px] font-black">Payment received.</h1>
        <p className="mt-3 text-[15px] font-semibold leading-7 text-[var(--text-2)]">
          Your plan or credits are applied automatically to this browser after the Dodo webhook lands.
        </p>

        <div className="mt-5 rounded-xl border border-[var(--edge)] bg-black/20 p-4 text-[14px] font-semibold text-[var(--text-2)]">
          {activated ? (
            <p>
              Active now: <strong>{plan}</strong> · <strong>{credits}</strong> generation credits available.
            </p>
          ) : (
            <p>
              Waiting for payment confirmation… this usually takes a few seconds. Checks run: {checks}.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/"
            className="font-brand inline-flex min-h-[46px] items-center justify-center rounded-xl bg-[var(--cyan)] px-5 text-[13px] font-black text-black transition hover:-translate-y-0.5"
          >
            Open analyzer
          </Link>
          <Link
            href="/pricing"
            className="font-brand inline-flex min-h-[46px] items-center justify-center rounded-xl border border-[var(--edge)] px-5 text-[13px] font-black text-[var(--foreground)] transition hover:-translate-y-0.5"
          >
            Back to pricing
          </Link>
        </div>

        {!activated && checks > 15 && (
          <p className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[13px] font-semibold text-amber-200">
            Still waiting. Check Vercel logs for /api/webhooks/dodo and confirm the Dodo webhook is enabled for payment.succeeded and subscription.active.
          </p>
        )}
      </section>
    </main>
  );
}
