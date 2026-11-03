import { currentVisitor, vk } from "./visitor";
import { query, run } from "./db";
import { getProduct } from "./catalog";
import { analyze } from "./service";
import { dispatch } from "./alerts/channels";
import { aiText } from "./ai";
import { getPrefs } from "./prefs";
import type { Purchase } from "./purchases";

export const DEFAULT_PROTECTION_DAYS = 14;
export interface ProtectionClaim { purchaseId: string; productId: string; productName: string; retailer: string; paid: number; nowPrice: number; drop: number;
  purchasedOn: string; deadline: string; daysLeft: number; draft: string; via: "llm" | "rules"; notifiedAt: string; orderId: string | null }

export const windowDays = (v?: number | null) => (v != null && v > 0 && v <= 365 ? Math.round(v) : DEFAULT_PROTECTION_DAYS);
/** Pure: is this purchase still inside its price-protection window, and did the price drop by at least $1? */
export function evaluateProtection(p: Pick<Purchase, "amount" | "created" | "status">, nowPrice: number, days = DEFAULT_PROTECTION_DAYS, now = new Date()) {
  const start = Date.parse(p.created); const deadline = start + days * 86400000;
  const daysLeft = Math.ceil((deadline - now.getTime()) / 86400000);
  const drop = Math.round((p.amount - nowPrice) * 100) / 100;
  const eligible = p.status === "completed" && now.getTime() <= deadline && drop >= 1;
  return { eligible, drop, daysLeft: Math.max(0, daysLeft), deadline: new Date(deadline).toISOString().slice(0, 10) };
}
/** Rule-based draft (used without an OpenAI key). The user copies it; PriceScout never sends it. */
export function ruleDraft(c: Omit<ProtectionClaim, "draft" | "via" | "notifiedAt">) {
  return `Subject: Price adjustment request — order ${c.orderId ?? "(your order #)"}

Hello ${c.retailer} support,

On ${c.purchasedOn} I purchased the ${c.productName} for $${c.paid.toFixed(2)}${c.orderId ? ` (PayPal order ${c.orderId})` : ""}. It is now listed on your site for $${c.nowPrice.toFixed(2)}, a difference of $${c.drop.toFixed(2)}.

Since this is within your price-adjustment window (through ${c.deadline}), I'd like to request a refund of the $${c.drop.toFixed(2)} difference to my original PayPal payment method. I'm happy to provide a screenshot of the current listing.

Thank you,
[Your name]`;
}
async function draftFor(base: Omit<ProtectionClaim, "draft" | "via" | "notifiedAt">) {
  const fb = ruleDraft(base);
  return aiText("Write a short, polite price-adjustment/refund request email from a shopper to a retailer's support team. Start with a 'Subject:' line. Use ONLY the facts given; never invent policy names or numbers. Sign off with '[Your name]'.",
    JSON.stringify(base), fb);
}
const kvKey = (id: string) => vk(`protect:${id}`);
export async function listClaims(): Promise<ProtectionClaim[]> {
  return (await query("SELECT v FROM kv WHERE k LIKE ?", [vk("protect:") + "%"])).map((r) => JSON.parse(String(r.v)) as ProtectionClaim).sort((a, b) => b.notifiedAt.localeCompare(a.notifiedAt));
}
/** After purchase, keep watching completed purchases; on a drop inside the window, alert via existing channels and store a copyable draft. */
export async function checkProtection(appUrl = "http://localhost:3000", now = new Date()) {
  const days = windowDays((await getPrefs()).protectionDays);
  const since = new Date(now.getTime() - days * 86400000).toISOString();
  const rows = await query("SELECT id, order_id, product_id, product_name, retailer, amount, status, created FROM purchases WHERE visitor = ? AND status = 'completed' AND created >= ?", [currentVisitor(), since]);
  const out: Array<{ purchaseId: string; eligible: boolean; drop: number; channels?: Record<string, string> }> = [];
  for (const r of rows) {
    const p = getProduct(String(r.product_id)); if (!p) continue;
    const { deals } = await analyze(p);
    const same = deals.find((d) => d.retailer === r.retailer); if (!same) continue;
    const ev = evaluateProtection({ amount: Number(r.amount), created: String(r.created), status: "completed" }, same.effectivePrice, days, now);
    const prev = (await query("SELECT v FROM kv WHERE k = ?", [kvKey(String(r.id))]))[0];
    const prevDrop = prev ? Number(JSON.parse(String(prev.v)).drop) : 0;
    if (!ev.eligible || ev.drop <= prevDrop + 0.005) { out.push({ purchaseId: String(r.id), eligible: ev.eligible, drop: ev.drop }); continue; }
    const base = { purchaseId: String(r.id), productId: p.id, productName: p.name, retailer: String(r.retailer), paid: Number(r.amount), nowPrice: same.effectivePrice, drop: ev.drop,
      purchasedOn: String(r.created).slice(0, 10), deadline: ev.deadline, daysLeft: ev.daysLeft, orderId: r.order_id ? String(r.order_id) : null };
    const d = await draftFor(base);
    const claim: ProtectionClaim = { ...base, draft: d.text, via: d.via, notifiedAt: now.toISOString() };
    await run("INSERT OR REPLACE INTO kv VALUES (?, ?)", [kvKey(claim.purchaseId), JSON.stringify(claim)]);
    const channels = await dispatch({ productId: p.id, productName: p.name, price: same.effectivePrice, drop: ev.drop, retailer: claim.retailer,
      title: `Price protection: ${p.name} dropped $${ev.drop.toFixed(2)}`,
      body: `You paid $${claim.paid.toFixed(2)} at ${claim.retailer}; it's now $${same.effectivePrice.toFixed(2)}. ${ev.daysLeft} day(s) left to request the difference — your refund request draft is ready to copy.`,
      url: `${appUrl.replace(/\/$/, "")}/#protection` });
    out.push({ purchaseId: claim.purchaseId, eligible: true, drop: ev.drop, channels });
  }
  return out;
}
