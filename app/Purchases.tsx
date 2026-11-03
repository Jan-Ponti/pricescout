"use client";
import { useEffect, useState } from "react";
type P = { id: string; order_id: string | null; product_name: string; retailer: string; amount: number; status: string; mode: string; source: string; approve_url: string | null; note: string | null; created: string };
export default function Purchases({ refreshKey }: { refreshKey?: number }) {
  const [d, setD] = useState<{ purchases: P[]; spentThisMonth: number; budget?: { monthlyBudget: number | null; remaining: number | null; pct: number | null }; saved?: { saved: number; count: number } } | null>(null);
  useEffect(() => { fetch("/api/purchases").then((r) => r.json()).then(setD); }, [refreshKey]);
  return (<div className="card" id="purchases" data-testid="purchases">
    <h3>Agent purchases {d ? <small className="note">· ${d.spentThisMonth.toFixed(2)} committed this month{d.budget?.monthlyBudget ? ` of $${d.budget.monthlyBudget.toFixed(2)} budget` : ""}</small> : null}</h3>
    {d?.saved && d.saved.count > 0 ? <div className="note" data-testid="total-saved" style={{ marginTop: 0 }}>💰 Total saved vs MSRP: <span className="saved">${d.saved.saved.toFixed(2)}</span> across {d.saved.count} purchase{d.saved.count === 1 ? "" : "s"}</div> : null}
    {d?.budget?.monthlyBudget ? <div data-testid="budget-bar" role="progressbar" aria-label="Monthly budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(d.budget.pct ?? 0))} title={`$${d.budget.remaining?.toFixed(2)} left`}><div style={{ background: "#eee", borderRadius: 6, height: 8 }}><div style={{ width: `${Math.min(100, d.budget.pct ?? 0)}%`, background: (d.budget.pct ?? 0) >= 100 ? "#d33" : (d.budget.pct ?? 0) >= 80 ? "#e9a400" : "#2a9d5c", height: 8, borderRadius: 6 }} /></div><div className="note" style={{ margin: "2px 0 6px" }}>${d.budget.remaining?.toFixed(2)} left this month · auto-buy will never go over</div></div> : null}
    {!d?.purchases.length ? <div className="note">No purchases yet. Arm 🤖 auto-buy on a watch or check out from chat.</div> :
      <div className="tablewrap"><table className="cards"><thead><tr><th>When</th><th>Item</th><th>Amount</th><th>How</th><th>Status</th></tr></thead><tbody>
        {d.purchases.map((p) => <tr key={p.id}><td data-label="When">{new Date(p.created).toLocaleDateString()}</td><td data-label="Item">{p.product_name}<div className="note" style={{ margin: 0 }}>{p.retailer}{p.order_id ? ` · ${p.order_id}` : ""}</div></td>
          <td data-label="Amount">${p.amount.toFixed(2)}</td><td data-label="How">{p.source}{p.mode !== "approval" ? ` · ${p.mode}` : ""}</td>
          <td data-label="Status">{p.status === "pending_approval" && p.approve_url ? <a href={p.approve_url}><button className="pp">Approve</button></a> : <span className={p.status === "completed" ? "ok" : p.status === "failed" ? "err" : ""}>{p.status.replace("_", " ")}</span>}</td></tr>)}
      </tbody></table></div>}
    <div className="note">PayPal sandbox — no real money moves.</div>
  </div>);
}
