"use client";
import { useEffect, useRef, useState } from "react";
import { newAutoBuys } from "@/lib/savings";
type P = { id: string; order_id: string | null; product_name: string; amount: number; status: string; source: string; approve_url: string | null };
const KEY = "ps_toasted";
/** Polls purchases and toasts each new auto-buy with its PayPal order ID and a link. */
export default function AutoBuyToast({ refreshKey }: { refreshKey?: number }) {
  const [toasts, setToasts] = useState<P[]>([]);
  const first = useRef(true);
  useEffect(() => {
    let alive = true;
    const tick = () => fetch("/api/purchases").then((r) => r.json()).then((d: { purchases: P[] }) => {
      if (!alive) return;
      const seen = new Set<string>(JSON.parse(localStorage.getItem(KEY) || "[]"));
      const fresh = newAutoBuys(d.purchases ?? [], seen);
      fresh.forEach((p) => seen.add(p.id)); localStorage.setItem(KEY, JSON.stringify(Array.from(seen).slice(-200)));
      // On first load only remember existing ones, don't toast history.
      if (!first.current && fresh.length) setToasts((t) => [...t, ...fresh]);
      first.current = false;
    }).catch(() => {});
    tick(); const iv = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(iv); };
  }, [refreshKey]);
  return (<div className="toasts" aria-live="polite" role="status">
    {toasts.map((p) => <div key={p.id} className="toast" data-testid="autobuy-toast">
      🤖 Auto-buy: <b>{p.product_name}</b> · ${p.amount.toFixed(2)}<br />
      Order <code>{p.order_id}</code> · {p.approve_url ? <a href={p.approve_url}>Approve in PayPal</a> : <a href="#purchases">View purchase</a>}
      <button className="ghost" aria-label="Dismiss notification" onClick={() => setToasts((t) => t.filter((x) => x.id !== p.id))}>×</button></div>)}
  </div>);
}
