"use client";
import { useEffect, useState } from "react";
type C = { purchaseId: string; productId: string; productName: string; retailer: string; paid: number; nowPrice: number; drop: number; deadline: string; daysLeft: number; draft: string; via: string };
export default function Protection({ refreshKey }: { refreshKey?: number }) {
  const [d, setD] = useState<{ claims: C[]; windowDays: number } | null>(null); const [copied, setCopied] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/protection").then((r) => r.json()).then(setD);
  useEffect(() => { load(); }, [refreshKey]);
  async function recheck() { setBusy(true); try { await fetch("/api/protection", { method: "POST" }); await load(); } finally { setBusy(false); } }
  async function simulate(productId: string) { setBusy(true); try { await fetch("/api/alerts/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, pct: 10 }) }); await load(); } finally { setBusy(false); } }
  return (<div className="card" id="protection" data-testid="protection">
    <h3>🛡️ Price protection <small className="note">· watching completed purchases for {d?.windowDays ?? 14} days</small></h3>
    {!d?.claims.length ? <div className="note">No price drops on recent purchases yet. If one drops inside the window, you&apos;ll get an alert and a refund request to copy.</div> :
      d.claims.map((c) => <div key={c.purchaseId} className="coupon" style={{ display: "block" }}>
        <b>{c.productName}</b> · {c.retailer}: paid ${c.paid.toFixed(2)}, now <span className="ok">${c.nowPrice.toFixed(2)}</span> (↓ ${c.drop.toFixed(2)}) · {c.daysLeft} day(s) left (until {c.deadline})
        <textarea readOnly value={c.draft} rows={8} style={{ width: "100%", marginTop: 6 }} aria-label="refund request draft" />
        <button className="ghost" onClick={() => { navigator.clipboard?.writeText(c.draft); setCopied(c.purchaseId); }}>{copied === c.purchaseId ? "Copied ✓" : "Copy request"}</button>
        <span className="note"> Draft by {c.via === "llm" ? "AI" : "template (no AI key)"} — PriceScout never sends it; paste it to the retailer yourself.</span>
      </div>)}
    <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className="ghost" disabled={busy} onClick={recheck}>Re-check purchases</button>
      {d && !d.claims.length && <PurchasedSim onSim={simulate} busy={busy} />}</div>
  </div>);
}
function PurchasedSim({ onSim, busy }: { onSim: (id: string) => void; busy: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => { fetch("/api/purchases").then((r) => r.json()).then((j) => setIds(Array.from(new Set((j.purchases ?? []).filter((p: any) => p.status === "completed").map((p: any) => p.product_id))))); }, []);
  if (!ids.length) return null;
  return <button className="ghost" disabled={busy} onClick={() => onSim(ids[0])}>Simulate drop on last purchase (demo)</button>;
}
