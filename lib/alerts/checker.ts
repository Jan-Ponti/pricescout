import { query, run } from "../db";
import { getProduct } from "../catalog";
import { analyze } from "../service";
import { evaluate, buildAlert } from "./rules";
import { dispatch } from "./channels";
export const appUrl = (fallback?: string) => process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || fallback || "http://localhost:3000";
/** Re-price every watched product (recording a snapshot), compare to the last checked price/target, and notify. */
export async function checkWatches(origin?: string) {
  const watches = await query("SELECT product_id, target, last_price FROM watches");
  const out = [];
  for (const w of watches) {
    const p = getProduct(String(w.product_id)); if (!p) continue;
    const { deals } = await analyze(p); const best = deals[0];
    const prev = w.last_price == null ? null : Number(w.last_price); const target = w.target == null ? null : Number(w.target);
    const reasons = evaluate(prev, best.effectivePrice, target);
    await run("UPDATE watches SET last_price = ? WHERE product_id = ?", [best.effectivePrice, p.id]);
    if (!reasons.length) { out.push({ productId: p.id, price: best.effectivePrice, alerted: false }); continue; }
    const alert = buildAlert(p.id, p.name, best, prev, reasons, appUrl(origin));
    out.push({ productId: p.id, price: best.effectivePrice, alerted: true, alert, channels: await dispatch(alert) });
  }
  return out;
}
