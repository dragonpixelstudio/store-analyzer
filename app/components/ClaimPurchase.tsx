"use client";
import { useState } from "react";
export default function ClaimPurchase() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function restore() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/account/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recoveryCode: code }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not restore wallet.");
      setCode("");
      setMessage(`Wallet restored. ${data.credits.remaining} credits available.`);
      window.dispatchEvent(new Event("dpx-wallet-changed"));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please retry."); }
    finally { setBusy(false); }
  }
  return <details className="wallet-restore"><summary>Restore credits from another browser or device</summary><p>Paste the recovery code you saved before checkout. Treat it like a password. If you purchased before recovery codes were introduced, contact support with your receipt.</p><label htmlFor="wallet-recovery-input">Wallet recovery code</label><input id="wallet-recovery-input" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)} placeholder="DPX1.…" maxLength={220} /><button type="button" onClick={() => void restore()} disabled={busy || !code.trim()}>{busy ? "Restoring…" : "Restore wallet"}</button>{message && <p role="status">{message}</p>}</details>;
}
