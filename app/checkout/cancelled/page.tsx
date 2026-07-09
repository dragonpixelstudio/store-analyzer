import Link from "next/link";

export default function CheckoutCancelledPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-16 text-[var(--foreground)]">
      <section className="mx-auto max-w-2xl rounded-2xl border border-[var(--edge)] bg-[#0d1423] p-6">
        <p className="font-brand text-[12px] font-semibold uppercase tracking-[.16em] text-[var(--magenta)]">
          Checkout cancelled
        </p>
        <h1 className="font-brand mt-3 text-[32px] font-black">No payment was completed.</h1>
        <p className="mt-3 text-[15px] font-semibold leading-7 text-[var(--text-2)]">
          You can return to pricing and start checkout again when ready.
        </p>
        <Link
          href="/pricing"
          className="font-brand mt-6 inline-flex min-h-[46px] items-center justify-center rounded-xl bg-[var(--cyan)] px-5 text-[13px] font-black text-black transition hover:-translate-y-0.5"
        >
          Back to pricing
        </Link>
      </section>
    </main>
  );
}
