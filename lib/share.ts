import crypto from "node:crypto";
import { query, run } from "./db";
import { getProduct } from "./catalog";
import { analyze } from "./service";
import { buildCheckout } from "./checkoutInput";
import { createOrder, captureOrder, sandboxCardCheckout } from "./paypal";

/** One share link per (single-user) app. Rotating it revokes the old link. Stored in kv. */
const TOKEN_KEY = "share:token";
export const validToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{24}$/.test(t);

export async function getShareToken(create = true): Promise<string | null> {
  const r = (await query("SELECT v FROM kv WHERE k = ?", [TOKEN_KEY]))[0];
  if (r) return String(r.v);
  if (!create) return null;
  return rotateShareToken();
}
export async function rotateShareToken() {
  const t = crypto.randomBytes(12).toString("hex");
  await run("INSERT OR REPLACE INTO kv VALUES (?, ?)", [TOKEN_KEY, t]);
  return t;
}
export async function revokeShareToken() { await run("DELETE FROM kv WHERE k = ?", [TOKEN_KEY]); }
export async function tokenMatches(t: unknown) {
  if (!validToken(t)) return false;
  const cur = await getShareToken(false);
  return !!cur && crypto.timingSafeEqual(Buffer.from(cur), Buffer.from(t));
}

export interface Gift { productId: string; orderId: string; from: string; amount: number; at: string }
const giftKey = (pid: string) => `gift:${pid}`;
export async function getGift(pid: string): Promise<Gift | null> {
  const r = (await query("SELECT v FROM kv WHERE k = ?", [giftKey(pid)]))[0];
  return r ? (JSON.parse(String(r.v)) as Gift) : null;
}
export async function listGifts(): Promise<Gift[]> {
  return (await query("SELECT v FROM kv WHERE k LIKE 'gift:%'")).map((r) => JSON.parse(String(r.v)) as Gift);
}
export async function markGifted(g: Gift) { await run("INSERT OR REPLACE INTO kv VALUES (?, ?)", [giftKey(g.productId), JSON.stringify(g)]); }

/** Read-only public view: names, best price, gifted flag. No targets, prefs, purchases or history. */
export async function sharedList() {
  const watches = await query("SELECT product_id FROM watches ORDER BY created DESC");
  const items = [];
  for (const w of watches) {
    const p = getProduct(String(w.product_id)); if (!p) continue;
    const best = (await analyze(p)).deals[0];
    const gift = await getGift(p.id);
    items.push({ productId: p.id, name: p.name, image: p.image, retailer: best?.retailer ?? null, price: best ? best.totalCost : null,
      gifted: !!gift, giftedBy: gift?.from ?? null });
  }
  return items;
}

const cleanName = (s: unknown) => String(s ?? "").replace(/[<>\n\r]/g, "").trim().slice(0, 40) || "A friend";

/** Friend checkout. mode "paypal" → approval redirect; mode "card" → sandbox test card, captured immediately. */
export async function startGift(req: Request, token: string, productId: string, from: unknown, mode: "paypal" | "card") {
  if (!(await tokenMatches(token))) throw Object.assign(new Error("invalid link"), { status: 404 });
  const watched = (await query("SELECT 1 FROM watches WHERE product_id = ?", [productId])).length > 0;
  if (!watched) throw Object.assign(new Error("not on this wishlist"), { status: 400 });
  if (await getGift(productId)) throw Object.assign(new Error("already gifted"), { status: 409 });
  const { input } = await buildCheckout(req, productId);
  const origin = new URL(req.url).origin;
  input.returnUrl = `${origin}/w/${token}?gift=${encodeURIComponent(productId)}`;
  input.cancelUrl = `${origin}/w/${token}?cancelled=1`;
  const amount = Math.round((input.price + input.shipping - input.discount) * 100) / 100;
  const name = cleanName(from);
  if (mode === "card") {
    const c = await sandboxCardCheckout(input);
    if (c.status !== "COMPLETED") throw new Error(`payment ${c.status}`);
    await markGifted({ productId, orderId: c.id, from: name, amount, at: new Date().toISOString() });
    return { status: "COMPLETED", orderId: c.id, via: c.via };
  }
  const o = await createOrder(input);
  await run("INSERT OR REPLACE INTO kv VALUES (?, ?)", [`giftorder:${o.id}`, JSON.stringify({ productId, from: name, amount })]);
  return { status: o.status, orderId: o.id, approveUrl: o.approveUrl, via: o.via };
}

/** Capture after PayPal approval. Only orders created by startGift can mark an item gifted. */
export async function finishGift(token: string, orderId: string) {
  if (!(await tokenMatches(token))) throw Object.assign(new Error("invalid link"), { status: 404 });
  if (!/^[A-Z0-9]{5,40}$/.test(orderId)) throw Object.assign(new Error("bad order id"), { status: 400 });
  const r = (await query("SELECT v FROM kv WHERE k = ?", [`giftorder:${orderId}`]))[0];
  if (!r) throw Object.assign(new Error("unknown gift order"), { status: 404 });
  const pend = JSON.parse(String(r.v)) as { productId: string; from: string; amount: number };
  const c = await captureOrder(orderId);
  if (c.status !== "COMPLETED") throw new Error(`payment ${c.status}`);
  await markGifted({ productId: pend.productId, orderId, from: pend.from, amount: pend.amount, at: new Date().toISOString() });
  await run("DELETE FROM kv WHERE k = ?", [`giftorder:${orderId}`]);
  return { status: "COMPLETED", productId: pend.productId, via: c.via };
}
