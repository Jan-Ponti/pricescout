"use client";
import { useState } from "react";
import { api, friendlyError } from "@/lib/client/api";

/** Guided empty state for first-time visitors: one click seeds a realistic demo account (scoped to this browser only). */
export default function DemoStart({ onSeeded, onTry }: { onSeeded: () => void; onTry: (q: string) => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function seed() {
    setBusy(true); setErr("");
    try { await api("/api/demo", { json: { action: "seed" } }); onSeeded(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  return (<div className="card empty demo-start" data-testid="demo-start">
    <h2>👋 Welcome to PriceScout</h2>
    <p>Your account is empty. Ask for a product in the chat, or load a demo account to see everything at once:</p>
    <ul className="reasons">
      <li>4 watched products, one with a fresh price drop</li>
      <li>A PayPal sandbox purchase and a price-protection refund draft</li>
      <li>A shareable gift wishlist</li>
    </ul>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="pp" disabled={busy} onClick={seed} data-testid="load-demo">{busy ? "Loading demo…" : "Load demo data"}</button>
      <button className="ghost" disabled={busy} onClick={() => onTry("Find me the best price on Sony WH-1000XM5 under $300")}>Or try a search</button>
    </div>
    {err && <div className="note err" role="alert">{err}</div>}
    <div className="note">Demo data is private to this browser and uses mock prices and the PayPal sandbox. You can reset it any time.</div>
  </div>);
}

export function ResetDemo({ onReset }: { onReset: () => void }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function reset() {
    if (!confirm("Reset your PriceScout data? This clears your watches, purchases, alerts and wishlist in this browser.")) return;
    setBusy(true); setErr("");
    try { await api("/api/demo", { json: { action: "reset" } }); onReset(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }
  return (<div className="note" style={{ textAlign: "right" }}>
    <button className="ghost" disabled={busy} onClick={reset} data-testid="reset-demo">{busy ? "Resetting…" : "Reset my data"}</button>
    {err && <span className="err" role="alert"> {err}</span>}
  </div>);
}
