import { query, run, serializeWatchOpts } from "./db";
import { getProduct } from "./catalog";
import { analyze } from "./service";
import { addPurchase } from "./purchases";
import { checkProtection } from "./protection";
import { getShareToken, revokeShareToken } from "./share";
import { currentVisitor, vk, DEFAULT_VISITOR } from "./visitor";

/** Products the demo seeds. The first one gets a simulated price drop; the purchase is used for price protection. */
export const DEMO_WATCHES = [
  { id: "sony-wh1000xm5", targetPct: 0.9, drop: 0.85 },
  { id: "nintendo-switch-oled", targetPct: 0.92 },
  { id: "kindle-paperwhite", targetPct: 0.95 },
  { id: "logitech-mx-master-3s", targetPct: 0.9 },
] as const;
export const DEMO_PURCHASE = "airpods-pro-2";

/** Seed the current visitor's account with watches (one dropped), a sandbox purchase, a protection claim and a wishlist link. Idempotent. */
export async function seedDemo(origin = "http://localhost:3000") {
  const v = currentVisitor(); const now = new Date();
  for (const w of DEMO_WATCHES) {
    const p = getProduct(w.id)!;
    const before = (await analyze(p)).deals[0].effectivePrice; // price before the simulated drop
    if ("drop" in w) await run("INSERT OR REPLACE INTO sim_drops (visitor, product_id, factor) VALUES (?,?,?)", [v, p.id, w.drop]);
    const after = "drop" in w ? (await analyze(p)).deals[0].effectivePrice : before;
    await run("INSERT OR REPLACE INTO watches (visitor, product_id, target, last_price, created, opts) VALUES (?,?,?,?,?,?)",
      [v, p.id, Math.round(before * w.targetPct), after, new Date(now.getTime() - 86400000).toISOString(), serializeWatchOpts({ alertAtl: true })]);
    if ("drop" in w) await run("INSERT INTO notifications (product_id, title, body, url, created, visitor) VALUES (?,?,?,?,?,?)",
      [p.id, `Price drop: ${p.name}`, `Now $${after.toFixed(2)} (was $${before.toFixed(2)}). Demo data.`, `/?product=${p.id}`, now.toISOString(), v]);
  }
  // A completed sandbox purchase from 3 days ago, paid ~8% more than today's price, so price protection finds a claim.
  const bp = getProduct(DEMO_PURCHASE)!; const best = (await analyze(bp)).deals[0];
  const pid = `demo-${v}`.slice(0, 64);
  if (!(await query("SELECT 1 FROM purchases WHERE id = ?", [pid])).length)
    await addPurchase({ id: pid, order_id: "DEMO" + Math.random().toString(36).slice(2, 12).toUpperCase(), product_id: bp.id, product_name: bp.name, retailer: best.retailer,
      amount: Math.round(best.effectivePrice * 1.08 * 100) / 100, status: "completed", mode: "approval", source: "demo", approve_url: null,
      note: "Demo data (PayPal sandbox)", created: new Date(now.getTime() - 3 * 86400000).toISOString() });
  await checkProtection(origin, now);
  const token = await getShareToken(true);
  return { ok: true, watches: DEMO_WATCHES.length, purchaseId: pid, shareUrl: `${origin.replace(/\/$/, "")}/w/${token}` };
}

/** Wipe the current visitor's data (watches, drops, purchases, notifications, prefs, claims, wishlist). Never touches other visitors. */
export async function resetVisitorData() {
  const v = currentVisitor();
  await revokeShareToken();
  for (const t of ["watches", "sim_drops", "purchases", "notifications", "orders", "push_subs"]) await run(`DELETE FROM ${t} WHERE visitor = ?`, [v]);
  if (v === DEFAULT_VISITOR) {
    await run("DELETE FROM kv WHERE k = ? OR k LIKE 'protect:%' OR k LIKE 'gift:%' OR k LIKE 'giftorder:%'", [vk("shopper_prefs")]);
  } else {
    await run("DELETE FROM kv WHERE k LIKE ?", [vk("") + "%"]);
  }
  return { ok: true };
}
