"use client";

import { useState } from "react";

// Links this browser to a completed Dodo purchase. The purchaser enters the
// email they used at checkout; on success the server sets the signed
// identity cookie and the analyzer immediately sees their plan and credits.
export default function ClaimPurchase() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function claim() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: data?.error ?? "Could not find that purchase." });
        return;
      }
      const plan = data?.account?.plan ?? "free";
      const credits = data?.credits?.remaining ?? 0;
      setMessage({
        ok: true,
        text: `Linked. Plan: ${plan === "free" ? "credits only" : plan}. ${credits} generation credits available. Head back to the analyzer to use them.`,
      });
    } catch {
      setMessage({ ok: false, text: "Something went wrong. Please retry." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-[var(--edge)] bg-black/25 p-6">
      <h3 className="text-[15px] font-black uppercase tracking-[.04em] text-[var(--foreground)]">
        Already purchased?
      </h3>
      <p className="mt-1 text-[13px] font-semibold text-[var(--muted)]">
        Enter the email you used at checkout to activate your plan and credits in this browser.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void claim()}
          placeholder="you@studio.com"
          className="min-w-[240px] flex-1 rounded-lg border border-[var(--edge)] bg-black/30 px-3 py-2.5 text-[13.5px] font-semibold text-[var(--foreground)] placeholder:text-[var(--faint)]"
          aria-label="Checkout email"
        />
        <button
          type="button"
          onClick={() => void claim()}
          disabled={busy}
          className="rounded-lg bg-[var(--cyan)] px-5 py-2.5 text-[13.5px] font-black text-black transition hover:-translate-y-0.5 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Activate my purchase"}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-[13px] font-semibold ${
            message.ok
              ? "border-[rgba(105,255,0,.3)] bg-[rgba(105,255,0,.08)] text-[var(--foreground)]"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
