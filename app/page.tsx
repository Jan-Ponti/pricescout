"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import PriceChart from "./PriceChart";
import { WatchPanel, NotificationCenter, useNotifications } from "./Alerts";
import Watchlist from "./Watchlist";
import PrefsPanel from "./Prefs";
import Purchases from "./Purchases";
import PayLater from "./PayLater";

type Deal = {
  retailer: string; price: number; shipping: number; inStock: boolean; source: string; discount: number;
  effectivePrice: number; tax: number; membershipSave: number; totalCost: number; score: number; scoreReasons: string[];
  condition?: string; etaDays?: number; coupon?: { code: string; description: string };
};
type Coupon = { code: string; retailer: string; description: string; verified: boolean; source: string };
type Product = { id: string; name: string; brand: string; category: string; image: string; msrp: number };
type Prediction = { verdict: string; confidence: number; reasons: string[]; nextSale?: { label: string; approxDate: string; expectedDropPct: number } | null; vsAvgPct: number; vsLowPct: number | null };
type Analysis = {
  product: Product; deals: Deal[]; coupons: Coupon[];
  insight: { lowest: { date: string; price: number; retailer: string } | null; avg90: number; current: number; prediction?: Prediction };
  sources: { prices: string[]; coupons: string[] }; prefs?: { zip?: string; budget?: number };
};
type Msg = { role: "user" | "bot"; text: string };

const md = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
const $ = (n: number) => `$${n.toFixed(2)}`;
const SUGGEST = [
  "Find me the best price on Sony WH-1000XM5 under $300",
  "I want AirPods Pro, ZIP 48201, I have Prime",
  "Track the Nintendo Switch OLED — open-box OK",
  "Cheapest Dyson V15? Need by Friday",
];

export default function Home() {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: "Hi! I'm **PriceScout**. Tell me what you want — I'll compare total cost (tax + memberships), score deals, chart history, watch for drops, and check out with **PayPal** once you approve." }]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
  const [a, setA] = useState<Analysis | null>(null); const [status, setStatus] = useState<{ ai: boolean; paypal: boolean; paypalClientId?: string | null } | null>(null);
  const [checkout, setCheckout] = useState<Deal | null>(null); const [result, setResult] = useState<string | null>(null); const [chartKey, setChartKey] = useState(0);
  const [watchKey, setWatchKey] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const { notes, refresh } = useNotifications();
  const onPrefs = useCallback(async () => {
    if (!a?.product.id) return;
    const r = await (await fetch(`/api/analyze?productId=${a.product.id}`)).json();
    if (r.deals) setA(r);
  }, [a?.product.id]);
  useEffect(() => { fetch("/api/status").then((r) => r.json()).then(setStatus); }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const id = q.get("buy"); if (!id) return;
    fetch(`/api/analyze?productId=${encodeURIComponent(id)}`).then((r) => r.json()).then((r) => { if (!r.deals) return;
      setA(r); setCheckout(r.deals.find((d: Deal) => d.retailer === q.get("retailer")) ?? r.deals[0]);
      setMsgs((m) => [...m, { role: "bot", text: `Price alert for **${r.product.name}** — review and approve the PayPal checkout.` }]); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", text }]); setInput(""); setBusy(true);
    try {
      const r = await (await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, currentProductId: a?.product.id }) })).json();
      setMsgs((m) => [...m, { role: "bot", text: r.reply ?? r.error }]);
      if (r.deals) setA(r);
      if (r.intent === "checkout" && (r.deals?.[0] || a?.deals[0])) { setResult(null); setCheckout(r.deals?.[0] ?? a!.deals[0]); }
    } finally { setBusy(false); }
  }
  async function openProduct(productId: string) {
    const r = await (await fetch(`/api/analyze?productId=${encodeURIComponent(productId)}`)).json();
    if (r.deals) { setA(r); setMsgs((m) => [...m, { role: "bot", text: `Opened **${r.product.name}** from your watchlist.` }]); }
  }
  async function pay(mode: "paypal" | "card") {
    if (!a || !checkout) return; setBusy(true); setResult(null);
    try {
      const body = JSON.stringify({ productId: a.product.id, retailer: checkout.retailer, approved: true });
      const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body };
      if (mode === "paypal") {
        const o = await (await fetch("/api/checkout/create", opts)).json();
        if (o.error) throw new Error(o.error);
        if (o.approveUrl) { window.location.href = o.approveUrl; return; }
      } else {
        const c = await (await fetch("/api/checkout/test-card", opts)).json();
        if (c.error) throw new Error(c.error);
        setResult(`✅ Payment ${c.status} — PayPal order ${c.id}, capture ${c.captureId ?? "n/a"} ($${c.amount ?? c.expected}) via ${c.via}`);
        setWatchKey((k) => k + 1);
        setMsgs((m) => [...m, { role: "bot", text: `Done! Paid **${$(checkout.effectivePrice)}** for ${a.product.name} at ${checkout.retailer}. PayPal order \`${c.id}\` is **${c.status}**.` }]);
      }
    } catch (e) { setResult(`❌ ${(e as Error).message}`); } finally { setBusy(false); }
  }
  const best = a?.deals[0];
  const pred = a?.insight.prediction;
  return (<>
    <header><div className="logo">Price<span>Scout</span> <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 14 }}>AI shopping agent · PayPal checkout</span></div>
      <div>{status && <><span className={`pill ${status.ai ? "on" : ""}`}>{status.ai ? "● LLM connected" : "○ Rule-based AI (no key)"}</span>
        <span className={`pill ${status.paypal ? "on" : ""}`}>{status.paypal ? "● PayPal sandbox" : "○ PayPal simulated"}</span></>} <NotificationCenter notes={notes} refresh={refresh} /></div></header>
    <main>
      <section className="card chat">
        <div className="msgs">{msgs.map((m, i) => <div key={i} className={`msg ${m.role}`} dangerouslySetInnerHTML={{ __html: md(m.text) }} />)}
          {busy && <div className="msg bot">Thinking…</div>}<div ref={end} /></div>
        <div className="chips">{SUGGEST.map((s) => <button key={s} className="ghost" onClick={() => send(s)}>{s}</button>)}</div>
        <form className="input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input aria-label="chat" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. best deal on a Kindle under $120, ZIP 48201" /><button disabled={busy}>Send</button></form>
      </section>
      <section>
        <div className="grid"><PrefsPanel onChange={() => { onPrefs(); }} /><Watchlist refreshKey={watchKey} onOpen={openProduct} /></div>
        <div className="grid"><Purchases refreshKey={watchKey + chartKey} /></div>
        {!a ? <div className="card empty"><h2>What are we buying today?</h2><p>Name a product in the chat. I&apos;ll rank by total cost, score the deal, apply coupons, and chart price history.</p></div> : <>
        <div className="card hero"><div className="emoji">{a.product.image}</div>
          <div><h2>{a.product.name}</h2><div style={{ color: "var(--muted)", fontSize: 14 }}>{a.product.brand} · {a.product.category} · MSRP {$(a.product.msrp)}</div></div>
          <div className="stats"><div className="stat"><small>Best total</small><b className="ok">{$(best!.totalCost)}</b><small>{best!.retailer} · score {best!.score}</small><PayLater amount={best!.effectivePrice} clientId={status?.paypalClientId} /></div>
            <div className="stat"><small>90-day avg</small><b>{$(a.insight.avg90)}</b></div>
            <div className="stat"><small>All-time low</small><b>{a.insight.lowest ? $(a.insight.lowest.price) : "–"}</b><small>{a.insight.lowest?.date}</small></div>
            <button className="pp" style={{ alignSelf: "center" }} onClick={() => { setResult(null); setCheckout(best!); }}>Checkout with PayPal</button></div></div>
        {pred && <div className={`card predict ${pred.verdict}`} data-testid="predict">
          <div><h3 style={{ margin: 0 }}>Buy / wait advice</h3>
            <b className="verdict-lg">{pred.verdict.toUpperCase()}</b> <span className="note" style={{ margin: 0 }}>{pred.confidence}% confidence · {pred.vsAvgPct}% vs 90-day avg{pred.vsLowPct != null ? ` · ${pred.vsLowPct}% vs low` : ""}</span>
            <ul className="reasons">{pred.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            {pred.nextSale && <div className="note">Next sale window: {pred.nextSale.label} (~{pred.nextSale.approxDate}, ~{pred.nextSale.expectedDropPct}% typical drop)</div>}
          </div>
        </div>}
        <div className="grid two">
          <div className="card"><h3>Price comparison (total cost)</h3><table><thead><tr><th>Retailer</th><th>Price</th><th>Ship</th><th>Tax</th><th>You pay</th><th>Score</th><th></th></tr></thead><tbody>
            {a.deals.map((d, i) => <tr key={d.retailer + (d.condition ?? "")} className={i === 0 ? "best" : ""}><td>{d.retailer}{i === 0 && <span className="tag">BEST</span>}{d.source === "mock" && <span className="tag mock">mock</span>}{d.condition && d.condition !== "new" && <span className="tag mock">{d.condition.replace("_", " ")}</span>}</td>
              <td>{$(d.price)}{d.coupon ? <div className="note" style={{ margin: 0 }}><code>{d.coupon.code}</code></div> : null}</td>
              <td>{d.shipping ? $(d.shipping) : "Free"}{d.membershipSave ? <div className="note ok" style={{ margin: 0 }}>−{$(d.membershipSave)} perk</div> : null}</td>
              <td>{$(d.tax)}</td>
              <td><b>{$(d.totalCost)}</b><PayLater compact amount={d.effectivePrice} />{!d.inStock && <span className="err"> (out of stock)</span>}{d.etaDays != null && <div className="note" style={{ margin: 0 }}>~{d.etaDays}d</div>}</td>
              <td><span className="scorepill" title={d.scoreReasons?.join(" · ")}>{d.score}</span></td>
              <td><button className="ghost" disabled={!d.inStock} onClick={() => { setResult(null); setCheckout(d); }}>Buy</button></td></tr>)}
          </tbody></table><div className="note">Ranked by estimated total (price + shipping − coupon − membership + tax). Checkout still charges the retailer amount before tax. Sources: {a.sources.prices.join(", ")}</div></div>
          <div className="card couponcard"><h3>Coupons found ({a.coupons.filter((c) => c.verified).length} valid)</h3><div className="couponlist">{a.coupons.length === 0 && <div className="note">No codes found.</div>}
            {a.coupons.map((c) => <div key={c.retailer + c.code} className={`coupon ${c.verified ? "" : "bad"}`}><div><code>{c.code}</code> · {c.retailer}<div className="note" style={{ margin: 0 }}>{c.description}</div></div>
              <span className={c.verified ? "ok" : "err"}>{c.verified ? "✓ valid" : "✗ expired"}</span></div>)}
            </div><div className="note">Sources: {a.sources.coupons.join(", ")}</div></div>
        </div>
        <div className="grid"><WatchPanel key={a.product.id} productId={a.product.id} best={best!.effectivePrice} onAlert={async () => { refresh(); const r = await (await fetch(`/api/analyze?productId=${a.product.id}`)).json(); if (r.deals) setA(r); setChartKey((k) => k + 1); setWatchKey((k) => k + 1); }} /></div>
        <div className="grid"><div className="card"><PriceChart key={chartKey} productId={a.product.id} /></div></div></>}
      </section>
    </main>
    {checkout && a && <div className="modal" onClick={() => !busy && setCheckout(null)}><div className="card" onClick={(e) => e.stopPropagation()}>
      <h2>Approve purchase</h2><div className="note" style={{ marginTop: 0 }}>The agent will not pay until you approve.</div>
      <div className="row"><span>{a.product.name}</span></div><div className="row"><span>Retailer</span><span>{checkout.retailer}</span></div>
      <div className="row"><span>Price</span><span>{$(checkout.price)}</span></div><div className="row"><span>Shipping</span><span>{checkout.shipping ? $(checkout.shipping) : "Free"}</span></div>
      {checkout.coupon && <div className="row ok"><span>Coupon {checkout.coupon.code}</span><span>−{$(checkout.discount)}</span></div>}
      {checkout.membershipSave > 0 && <div className="row ok"><span>Membership perk</span><span>−{$(checkout.membershipSave)}</span></div>}
      <div className="row"><span>Est. tax</span><span>{$(checkout.tax)}</span></div>
      <div className="row total"><span>Retailer total (charged)</span><span>{$(checkout.effectivePrice)}</span></div>
      <div className="row"><span>Est. all-in</span><span>{$(checkout.totalCost)}</span></div>
      <PayLater amount={checkout.effectivePrice} clientId={status?.paypalClientId} />
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="pp" disabled={busy} onClick={() => pay("paypal")}>Approve &amp; pay with PayPal</button>
        <button className="ghost" disabled={busy} onClick={() => pay("card")}>Instant sandbox test-card pay</button>
        <button className="ghost" disabled={busy} onClick={() => setCheckout(null)}>Cancel</button></div>
      {result && <div className={`note ${result.startsWith("✅") ? "ok" : "err"}`} data-testid="result">{result}</div>}
      <div className="note">PayPal sandbox — no real money moves. Tax is an estimate for ranking; the PayPal order uses the retailer amount.</div>
    </div></div>}
  </>);
}
