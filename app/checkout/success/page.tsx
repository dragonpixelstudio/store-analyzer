"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import "../../wallet.css";
type Status = { state?: string; credits?: number; remaining?: number; error?: string };
export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<Status>({});
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [returnState, setReturnState] = useState("");
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>; let count = 0;
    const params = new URL(window.location.href).searchParams;
    const order = params.get("order");
    // Return parameters are display hints only. Credits and successful payment
    // confirmation always come from the authenticated server ledger.
    const returned = params.get("status") || "";
    const interrupted = ["failed", "cancelled", "canceled"].includes(returned);

    async function poll() {
      if (!order) { setStatus({ error: "Open your original checkout link, or contact support with your receipt." }); setDone(true); return; }
      let finished = false;
      try {
        const response = await fetch(`/api/checkout/status?order=${encodeURIComponent(order)}`, { cache: "no-store" });
        const result = await response.json();
        if (stopped) return;
        setReturnState(interrupted ? returned : "");
        setStatus(result);
        finished = ["paid", "refunded", "failed", "cancelled"].includes(result.state) || response.status === 404 || interrupted;
      } catch { if (!stopped) setStatus({ error: "Could not check your payment yet. Please try again shortly." }); }
      if (!stopped) { count++; if (finished || interrupted || count >= 20) setDone(true); else timer = setTimeout(poll, 3000); }
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [attempt]);
  const paid = status.state === "paid", refunded = status.state === "refunded";
  const interrupted = !paid && !refunded && (["failed", "cancelled"].includes(status.state || "") || !!returnState);
  const title = paid ? "Your credits are ready." : refunded ? "Purchase refunded." : interrupted ? "Checkout was not completed." : done ? "Payment not confirmed yet." : "Confirming your payment…";
  return <main className="wallet-page"><section className="wallet-content wallet-success">
    <p className="wallet-eyebrow">DRAGON PIXEL STUDIO</p><h1>{title}</h1>
    <p>{paid ? `${status.credits} credits were added for this purchase. Your available balance is ${status.remaining} credits.` : refunded ? "The corresponding credits have been adjusted in your wallet." : interrupted ? "Checkout reported a declined or cancelled payment. You can return to your wallet to try again." : "Your balance updates only after payment confirmation."}</p>
    {status.error && <p role="alert">{status.error}</p>}
    {done && !paid && !refunded && <>{!interrupted && <p>If you have a payment receipt, keep it and contact support before paying again.</p>}<button type="button" onClick={() => { setDone(false); setAttempt(a => a + 1); }}>Check payment status</button></>}
    <div><Link href="/">Open studio →</Link><Link href="/pricing">{interrupted ? "Return to wallet" : "View wallet"}</Link>{!paid && <Link href="/contact">Contact support</Link>}</div>
  </section></main>;
}
