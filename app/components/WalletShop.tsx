"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CREDIT_PACKS } from "@/lib/billingCatalog";
import type { LedgerEntry } from "@/lib/billingStore";
import ClaimPurchase from "./ClaimPurchase";

export default function WalletShop({ checkoutOpen }: { checkoutOpen: boolean }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<LedgerEntry[]>([]);
  const [recovery, setRecovery] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  function closeWallet() { if (!busy) dialog.current?.close(); }
  function choosePack(product: string) {
    if (!checkoutOpen || busy) return;
    setSelected(product); setError(""); setNotice("");
    dialog.current?.showModal();
    if (!recovery) void prepare();
  }
  async function refresh() {
    try {
      const response = await fetch("/api/account/status", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Balance unavailable.");
      setBalance(data.credits.remaining); setHistory(data.history || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Balance unavailable."); }
  }
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    const changed = () => { setRecovery(""); setSaved(false); void refresh(); };
    window.addEventListener("dpx-wallet-changed", changed);
    return () => { clearTimeout(timer); window.removeEventListener("dpx-wallet-changed", changed); };
  }, []);
  async function prepare() {
    if (busy) return;
    setBusy("prepare"); setError("");
    try {
      const response = await fetch("/api/account/recovery", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (typeof data.recoveryCode !== "string" || !data.recoveryCode.startsWith("DPX1.")) throw new Error("Could not prepare your wallet. Please try again.");
      setRecovery(data.recoveryCode); setSaved(false); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Wallet unavailable."); }
    finally { setBusy(""); }
  }
  function downloadCode() {
    const blob = new Blob([`Dragon Pixel Studio wallet recovery code\n\n${recovery}\n\nKeep this private, like a password. Use it on the Credits page to restore your balance on another device.\nNever send this code to support or include it in a screenshot.\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "dragon-pixel-wallet-recovery.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("Recovery file downloaded. Save it somewhere private before continuing.");
  }
  async function buy(product: string) {
    if (!checkoutOpen || busy || !saved || !recovery) return;
    setBusy(product); setError("");
    try {
      const response = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product, recoveryAcknowledged: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout unavailable.");
      window.location.assign(data.checkoutUrl);
    } catch (e) { setError(e instanceof Error ? e.message : "Checkout unavailable."); setBusy(""); }
  }
  return <div className="wallet-content">
    <section className="wallet-intro"><div><p className="wallet-eyebrow">YOUR CREATIVE WALLET</p><h1>Credits</h1><p>One credit creates one image or one AI edit. Buy a pack when you need more, and keep creating at your own pace.</p></div><div className="wallet-balance"><span>Available credits</span><strong>{balance === null ? "…" : balance}</strong><Link href="/">Back to the studio →</Link></div></section>
    <div className="wallet-rules"><span><strong>1 credit</strong> per generated image or AI edit</span><span><strong>Free</strong> resizing, exports & screenshot layouts</span><span><strong>No subscription</strong> · purchased credits don’t expire</span></div>
    {error && <div className="wallet-message" role="alert">{error} <button type="button" onClick={() => { setError(""); void refresh(); }}>Refresh balance</button></div>}
    {!checkoutOpen && <p className="wallet-message">Paid checkout is being prepared for launch. Try your free credits now; purchases will open after payment testing is complete.</p>}
    <section className="wallet-packs" aria-label="Credit packs">{CREDIT_PACKS.map((pack, i) => <article className={`wallet-pack ${i === 1 ? "featured" : ""}`} key={pack.key}><p>{pack.name}</p><h2>{pack.credits}<span> credits</span></h2><div className="wallet-price">${pack.cents / 100}<small> USD · one-time</small></div><p>{i === 0 ? "Explore a few directions for your next asset." : "Build a coordinated set of icons, capsules and thumbnails."}</p><ul><li>{pack.credits} image generations or AI edits</li><li>Full-resolution downloads</li><li>Failed generations return their credits</li><li>No recurring charge</li></ul><button type="button" disabled={!checkoutOpen || !!busy} onClick={() => choosePack(pack.key)}>{busy === pack.key ? "Opening secure checkout…" : `Buy ${pack.credits} credits`}</button><small>${(pack.cents / 100 / pack.credits).toFixed(2)} per image · tax may apply</small></article>)}</section>
    <p className="wallet-discount-note">Have a discount code? Enter it at secure checkout.</p>
    <dialog ref={dialog} className="wallet-checkout-dialog" aria-labelledby="wallet-checkout-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="wallet-dialog-heading"><span className="wallet-eyebrow">SECURE CHECKOUT</span><button type="button" aria-label="Close wallet setup" onClick={closeWallet} disabled={!!busy}>✕</button></div>
      <h2 id="wallet-checkout-title">Keep access to your credits</h2>
      {selected && <p className="wallet-selected-pack">{CREDIT_PACKS.find(pack=>pack.key===selected)?.credits} credits selected</p>}
      <p>Save your private recovery code to restore your balance on another device or after clearing cookies.</p>
      {!recovery ? <button type="button" onClick={() => void prepare()} disabled={!!busy}>{busy === "prepare" ? "Preparing wallet…" : "Retry wallet setup"}</button> : <><button type="button" onClick={downloadCode} disabled={!!busy}>Download recovery code</button><label className="wallet-confirm"><input type="checkbox" checked={saved} disabled={!!busy} onChange={e => setSaved(e.target.checked)} />I saved my recovery code somewhere private.</label></>}
      {notice && <p role="status">{notice}</p>}{error && <p className="wallet-dialog-error" role="alert">{error}</p>}
      <button className="wallet-continue" type="button" disabled={!checkoutOpen || !saved || !recovery || !!busy} onClick={()=>void buy(selected)}>{busy && busy!=="prepare"?"Opening secure checkout…":"Continue to payment"}</button>
      <p className="wallet-dialog-note">Apply your discount code on the next screen. No payment is taken here.</p>
    </dialog>
    <section className="wallet-safety"><h2>Keep your credits across devices</h2><p>Credit purchases use a private wallet. Your recovery code restores it across browsers and devices. We help you save it before checkout.</p><ClaimPurchase /></section>
    <section className="wallet-history"><h2>Recent credit activity</h2>{history.length ? <ul>{history.map(entry => <li key={`${entry.kind}-${entry.id}`}><div><strong>{entry.label}</strong><time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time></div><span>{entry.amount > 0 ? "+" : ""}{entry.amount} credits</span></li>)}</ul> : <p>Your purchases, generations and adjustments will appear here.</p>}</section>
    <section className="wallet-faq"><h2>A simple credit system</h2><details><summary>What is included for free?</summary><p>You get 3 trial credits once per network. Resizing, exporting, and arranging your own gameplay screenshots stay free. Free analysis includes 3 reports per day, shared across browsers on the same network and linked to your wallet. It resets at 00:00 UTC.</p></details><details><summary>When are credits charged?</summary><p>The cost is shown before you generate. We reserve it while the image is being created and return it if generation fails. Interrupted requests are reconciled when you check your balance, after a 15-minute recovery window. An AI edit creates a new image and costs another credit.</p></details><details><summary>What happens after a payment or refund?</summary><p>Dodo Payments handles payment, receipts and applicable taxes. Credits appear after payment is confirmed. Refunds remove the corresponding purchased credits; if those credits were already spent, your balance can become negative until topped up. <Link href="/refund-policy">Read the refund policy.</Link></p></details><details><summary>Can I use this for screenshots?</summary><p>Use your actual gameplay captures in the screenshot editor. AI-generated artwork is for promotional assets such as icons, capsules and thumbnails; it should not be passed off as gameplay.</p></details></section>
  </div>;
}
