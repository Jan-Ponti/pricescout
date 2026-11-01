"use client";
import { useEffect, useState } from "react";
type P = { id: string; order_id: string | null; product_name: string; retailer: string; amount: number; status: string; mode: string; source: string; approve_url: string | null; note: string | null; created: string };
export default function Purchases({ refreshKey }: { refreshKey?: number }) {
  const [d, setD] = useState<{ purchases: P[]; spentThisMonth: number } | null>(null);
  useEffect(() => { fetch("/api/purchases").then((r) => r.json()).then(setD); }, [refreshKey]);
  return (<div className="card" id="purchases" data-testid="purchases">
    <h3>Agent purchases {d ? <small className="note">· ${d.spentThisMonth.toFixed(2)} committed this month</small> : null}</h3>
    {!d?.purchases.length ? <div className="note">No purchases yet. Arm 🤖 auto-buy on a watch or check out from chat.</div> :
      <table><thead><tr><th>When</th><th>Item</th><th>Amount</th><th>How</th><th>Status</th></tr></thead><tbody>
        {d.purchases.map((p) => <tr key={p.id}><td>{new Date(p.created).toLocaleDateString()}</td><td>{p.product_name}<div className="note" style={{ margin: 0 }}>{p.retailer}{p.order_id ? ` · ${p.order_id}` : ""}</div></td>
          <td>${p.amount.toFixed(2)}</td><td>{p.source}{p.mode !== "approval" ? ` · ${p.mode}` : ""}</td>
          <td>{p.status === "pending_approval" && p.approve_url ? <a href={p.approve_url}><button className="pp">Approve</button></a> : <span className={p.status === "completed" ? "ok" : p.status === "failed" ? "err" : ""}>{p.status.replace("_", " ")}</span>}</td></tr>)}
      </tbody></table>}
    <div className="note">PayPal sandbox — no real money moves.</div>
  </div>);
}
