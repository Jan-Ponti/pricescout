"use client";
import { useCallback, useEffect, useState } from "react";

type Item = {
  productId: string; product: { id: string; name: string; image: string; brand: string };
  target: number | null; pctToTarget: number | null; spark: number[];
  best: { retailer: string; effectivePrice: number; totalCost: number; score: number; coupon?: string; inStock: boolean } | null;
  insight: { prediction?: { verdict: string; confidence: number }; lowest: { price: number } | null; avg90: number };
  gift?: { from: string } | null;
};

function Spark({ values }: { values: number[] }) {
  if (!values.length) return null;
  const min = Math.min(...values); const max = Math.max(...values); const span = Math.max(0.01, max - min);
  const w = 72; const h = 28;
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} aria-hidden><polyline fill="none" stroke="var(--good)" strokeWidth="2" points={pts} /></svg>;
}

export default function Watchlist({ onOpen, refreshKey }: { onOpen: (productId: string) => void; refreshKey?: number }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const load = useCallback(() => {
    setBusy(true);
    fetch("/api/watchlist").then((r) => r.json()).then((d) => setItems(d.items ?? [])).finally(() => setBusy(false));
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  if (!items.length && !busy) return (
    <div className="card" data-testid="watchlist">
      <h3>Watchlist</h3>
      <div className="note">No watches yet. Analyze a product and hit Watch price — everything you track shows up here.</div>
    </div>
  );
  async function share() {
    const j = await (await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create" }) })).json();
    setShareUrl(j.url); try { await navigator.clipboard.writeText(j.url); } catch {}
  }
  return (
    <div className="card" data-testid="watchlist">
      {shareUrl && <div className="note">Share link (copied): <a href={shareUrl} target="_blank">{shareUrl}</a>{" "}
        <button className="ghost" onClick={async () => { await fetch("/api/share", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke" }) }); setShareUrl(null); }}>Revoke</button></div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Watchlist ({items.length})</h3>
        <span>
          <button className="ghost" onClick={share} title="Read-only wishlist link friends can gift from">{shareUrl ? "Copy share link" : "Share wishlist"}</button>{" "}
          <button className="ghost" onClick={load} disabled={busy}>{busy ? "Refreshing…" : "Refresh"}</button>
        </span>
      </div>
      <div className="watchgrid">
        {items.map((it) => {
          const v = it.insight.prediction?.verdict ?? "watch";
          return (
            <button key={it.productId} className="watchrow" onClick={() => onOpen(it.productId)}>
              <span className="emoji sm">{it.product.image}</span>
              <span className="watchmeta">
                <b>{it.product.name}</b>
                <small>{it.best ? `${it.best.retailer} · $${it.best.effectivePrice.toFixed(2)}${it.best.coupon ? ` · ${it.best.coupon}` : ""}` : "—"}
                  {it.target != null ? ` · target $${it.target.toFixed(2)}` : ""}
                  {it.pctToTarget != null ? ` (${it.pctToTarget > 0 ? "+" : ""}${it.pctToTarget.toFixed(0)}%)` : ""}
                </small>
              </span>
              <Spark values={it.spark} />
              {it.gift ? <span className="verdict buy" title={`Gifted by ${it.gift.from}`}>gifted</span> : <span className={`verdict ${v}`}>{v}</span>}
              <span className="scorepill">{it.best?.score ?? "–"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
