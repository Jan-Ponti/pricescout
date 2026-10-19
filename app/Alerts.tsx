"use client";
import { useEffect, useState, useCallback } from "react";
type Note = { id: number; title: string; body: string; url: string; created: string; read: number };
function b64ToU8(s: string) { const p = "=".repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }

export function useNotifications() {
  const [notes, setNotes] = useState<Note[]>([]);
  const refresh = useCallback(() => fetch("/api/notifications").then((r) => r.json()).then(setNotes), []);
  useEffect(() => {
    refresh(); const t = setInterval(refresh, 15000);
    const onMsg = () => refresh(); navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => { clearInterval(t); navigator.serviceWorker?.removeEventListener("message", onMsg); };
  }, [refresh]);
  return { notes, refresh };
}

export function NotificationCenter({ notes, refresh }: { notes: Note[]; refresh: () => void }) {
  const [open, setOpen] = useState(false); const unread = notes.filter((n) => !n.read).length;
  return (<span style={{ position: "relative" }}>
    <button className="ghost" aria-label="notifications" onClick={() => { setOpen(!open); if (!open && unread) fetch("/api/notifications", { method: "POST" }).then(refresh); }}>
      🔔{unread > 0 && <span className="badge">{unread}</span>}</button>
    {open && <div className="card notes" data-testid="notes"><h3>Notifications</h3>{notes.length === 0 && <div className="note">No alerts yet. Watch a product to get price-drop alerts.</div>}
      {notes.map((n) => <div key={n.id} className="notecard"><b>{n.title}</b><div>{n.body}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}><small>{new Date(n.created).toLocaleString()}</small>
          <a href={n.url}><button className="pp">Buy with PayPal</button></a></div></div>)}</div>}
  </span>);
}

export function WatchPanel({ productId, best, onAlert }: { productId: string; best: number; onAlert: () => void }) {
  const [watch, setWatch] = useState<{ target: number | null; last_price: number } | null>(null);
  const [target, setTarget] = useState(""); const [msg, setMsg] = useState(""); const [push, setPush] = useState<string>("unknown");
  useEffect(() => {
    fetch("/api/watch").then((r) => r.json()).then((ws) => { const w = ws.find((x: any) => x.product_id === productId); setWatch(w ?? null); setTarget(w?.target ? String(w.target) : ""); });
    setPush(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, [productId]);
  async function enablePush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setPush("unsupported"); return; }
      const perm = await Notification.requestPermission(); setPush(perm); if (perm !== "granted") return;
      const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/vapid")).json();
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) }));
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
      setMsg("Browser push enabled ✓");
    } catch (e) { setMsg(`Push failed: ${(e as Error).message}`); }
  }
  async function save() {
    const r = await (await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, target }) })).json();
    if (r.error) return setMsg(r.error); setWatch(r); setMsg(`Watching${r.target ? ` — alert at $${r.target.toFixed(2)} or any drop` : " — alert on any price drop"}`);
  }
  async function simulate() {
    const r = await (await fetch("/api/alerts/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) })).json();
    const x = r.results?.[0]; setMsg(r.error ?? (x?.alerted ? `Alert sent: ${x.alert.body} Channels: ${Object.entries(x.channels).map(([k, v]) => `${k} ${v}`).join(" · ")}` : `New price $${x?.price}; no alert`));
    onAlert();
  }
  return (<div className="card" data-testid="watch"><h3>Price-drop alerts</h3>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input aria-label="target" style={{ maxWidth: 160 }} placeholder={`Target (e.g. ${Math.floor(best * 0.9)})`} value={target} onChange={(e) => setTarget(e.target.value)} />
      <button onClick={save}>{watch ? "Update watch" : "👁 Watch price"}</button>
      {watch && <button className="ghost" onClick={async () => { await fetch(`/api/watch?productId=${productId}`, { method: "DELETE" }); setWatch(null); setMsg("Stopped watching (simulated drops reset)"); }}>Unwatch</button>}
      <button className="ghost" onClick={enablePush} disabled={push === "granted" && msg.includes("enabled")}>{push === "granted" ? "🔔 Push on" : "Enable browser push"}</button>
      <button className="ghost" disabled={!watch} onClick={simulate}>⚡ Simulate price drop</button></div>
    {watch && <div className="note">Last checked best price: ${Number(watch.last_price).toFixed(2)}{watch.target ? ` · target $${Number(watch.target).toFixed(2)}` : ""} · scheduled checks run via /api/cron/check-prices</div>}
    {msg && <div className="note ok" data-testid="watchmsg">{msg}</div>}</div>);
}
