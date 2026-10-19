// Verifies real Web Push end to end in a headed Chrome: subscribe -> simulate drop -> push delivered to service worker.
import { chromium } from "playwright"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ps-push-"));
const ctx = await chromium.launchPersistentContext(dir, { headless: false, channel: process.env.PW_CHANNEL || "chrome", args: ["--no-sandbox"], viewport: { width: 1300, height: 900 } });
await ctx.grantPermissions(["notifications"], { origin: BASE });
const page = await ctx.newPage(); await page.goto(`${BASE}/?buy=kindle-paperwhite`);
const sub = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready;
  window.__pushes = []; navigator.serviceWorker.addEventListener("message", (e) => window.__pushes.push(e.data));
  const { publicKey } = await (await fetch("/api/push/vapid")).json();
  const p = "=".repeat((4 - (publicKey.length % 4)) % 4); const b = atob((publicKey + p).replace(/-/g, "+").replace(/_/g, "/"));
  try { const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(b, (c) => c.charCodeAt(0)) });
    await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }); return new URL(s.endpoint).host; }
  catch (e) { return "ERR " + e.message; }
});
console.log("subscription endpoint host:", sub);
await fetch(`${BASE}/api/watch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "kindle-paperwhite" }) });
const r = await (await fetch(`${BASE}/api/alerts/simulate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "kindle-paperwhite" }) })).json();
console.log("channels:", JSON.stringify(r.results?.[0]?.channels));
await page.waitForFunction(() => window.__pushes.length > 0, null, { timeout: 30000 }).then(async () => console.log("service worker received push:", JSON.stringify(await page.evaluate(() => window.__pushes[0]))), () => console.log("no push received by service worker within 30s"));
await ctx.close();
