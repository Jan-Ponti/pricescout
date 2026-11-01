import { query, run, parseWatchOpts, serializeWatchOpts } from "../db";
import { getProduct } from "../catalog";
import { analyze } from "../service";
import { evaluate, buildAlert } from "./rules";
import { dispatch } from "./channels";
import type { WatchOpts } from "../types";
export const appUrl = (fallback?: string) => process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || fallback || "http://localhost:3000";
/** Re-price every watched product (recording a snapshot), compare to the last checked price/target, and notify. */
export async function checkWatches(origin?: string) {
  const watches = await query("SELECT product_id, target, last_price, opts FROM watches");
  const out = [];
  for (const w of watches) {
    const p = getProduct(String(w.product_id)); if (!p) continue;
    const opts = parseWatchOpts(w.opts) as WatchOpts;
    const { deals, insight } = await analyze(p); const best = deals[0];
    const prev = w.last_price == null ? null : Number(w.last_price); const target = w.target == null ? null : Number(w.target);
    const reasons = evaluate(prev, best.effectivePrice, {
      target, lowest: insight.lowest?.price ?? null,
      alertAtl: !!opts.alertAtl, nearLowPct: opts.nearLowPct ?? null,
      alertStock: !!opts.alertStock, alertCoupon: !!opts.alertCoupon,
      wasInStock: opts.lastInStock ?? null, nowInStock: best.inStock,
      hadCoupon: opts.lastHadCoupon ?? null, hasCoupon: !!best.coupon,
    });
    const nextOpts: WatchOpts = { ...opts, lastInStock: best.inStock, lastHadCoupon: !!best.coupon };
    await run("UPDATE watches SET last_price = ?, opts = ? WHERE product_id = ?", [best.effectivePrice, serializeWatchOpts(nextOpts), p.id]);
    if (!reasons.length) { out.push({ productId: p.id, price: best.effectivePrice, alerted: false }); continue; }
    const alert = buildAlert(p.id, p.name, best, prev, reasons, appUrl(origin));
    out.push({ productId: p.id, price: best.effectivePrice, alerted: true, alert, channels: await dispatch(alert) });
  }
  return out;
}
