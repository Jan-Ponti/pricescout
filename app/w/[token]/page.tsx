"use client";
import { useEffect, useState } from "react";
type Item = { productId: string; name: string; image: string; retailer: string | null; price: number | null; gifted: boolean; giftedBy: string | null };
export default function SharedWishlist({ params }: { params: { token: string } }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [from, setFrom] = useState(""); const [busy, setBusy] = useState("");
  const api = `/api/w/${params.token}`;
  const load = () => fetch(api).then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error); else setItems(j.items); });
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const orderId = q.get("token");
    if (q.get("cancelled")) setMsg("Checkout cancelled. Nothing was charged.");
    if (q.get("gift") && orderId) {
      setMsg("Finishing your gift…");
      fetch(`${api}/capture`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId }) })
        .then(async (r) => { const j = await r.json(); setMsg(r.ok ? "🎁 Gift paid! It's now marked as gifted." : `Couldn't finish: ${j.error}`); history.replaceState(null, "", location.pathname); load(); });
    } else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function gift(id: string, mode: "paypal" | "card") {
    setBusy(id); setMsg("");
    const r = await fetch(`${api}/checkout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: id, from, mode }) });
    const j = await r.json(); setBusy("");
    if (!r.ok) return setMsg(`Couldn't start checkout: ${j.error}`);
    if (j.approveUrl) { location.href = j.approveUrl; return; }
    setMsg(j.status === "COMPLETED" ? `🎁 Gift paid (${j.via}). It's now marked as gifted.` : `Order ${j.status}`); load();
  }
  return (
    <main className="container" data-testid="shared-wishlist">
      <h1>🎁 Wishlist</h1>
      <p className="note">Shared from PriceScout. This is read-only. Pay for an item with PayPal (sandbox) and it shows as gifted. Prices are mock demo data.</p>
      {err && <div className="card">{err}</div>}
      {msg && <div className="card">{msg}</div>}
      {items && <div className="card">
        <label>Your name (shown to the owner) <input value={from} maxLength={40} onChange={(e) => setFrom(e.target.value)} placeholder="A friend" /></label>
        {!items.length && <div className="note">Nothing on this wishlist yet.</div>}
        {items.map((it) => (
          <div key={it.productId} className="watchrow" style={{ cursor: "default" }}>
            <span className="emoji sm">{it.image}</span>
            <span className="watchmeta"><b>{it.name}</b><small>{it.price != null ? `${it.retailer} · $${it.price.toFixed(2)}` : "—"}</small></span>
            {it.gifted ? <span className="verdict buy">gifted{it.giftedBy ? ` by ${it.giftedBy}` : ""}</span> : <span>
              <button disabled={!!busy || it.price == null} onClick={() => gift(it.productId, "paypal")}>{busy === it.productId ? "…" : "Gift with PayPal"}</button>{" "}
              <button className="ghost" disabled={!!busy || it.price == null} onClick={() => gift(it.productId, "card")} title="PayPal sandbox test card, no login">Sandbox test card</button>
            </span>}
          </div>
        ))}
      </div>}
    </main>
  );
}
