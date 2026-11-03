import { currentVisitor, withVisitor } from "../visitor";
import { listVisitors } from "../db";
import { query, run, parseWatchOpts, serializeWatchOpts } from "../db";
import { getProduct } from "../catalog";
import { analyze } from "../service";
import { evaluate, buildAlert } from "./rules";
import { dispatch } from "./channels";
import type { WatchOpts } from "../types";
import { decideAutoBuy, executeAutoBuy, spentThisMonth } from "../autobuy";
import { getPrefs } from "../prefs";
export const appUrl = (fallback?: string) => process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || fallback || "http://localhost:3000";
/** Re-price every watched product (recording a snapshot), compare to the last checked price/target, and notify. */
export async function checkWatches(origin?: string) {
  const watches = await query("SELECT product_id, target, last_price, opts FROM watches WHERE visitor = ?", [currentVisitor()]);
  const out = [];
  const monthlyBudget = (await getPrefs()).monthlyBudget ?? null;
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
    let autoBuy: Awaited<ReturnType<typeof executeAutoBuy>> | undefined; let autoBuyChannels: Record<string, string> | undefined;
    const decision = decideAutoBuy(opts.autoBuy, best, opts.autoBuy?.enabled ? await spentThisMonth() : 0, monthlyBudget);
    if (decision.buy && opts.autoBuy) {
      autoBuy = await executeAutoBuy(p, best, opts.autoBuy, appUrl(origin));
      // One-shot: disarm after firing so the agent never buys the same item twice.
      nextOpts.autoBuy = { ...opts.autoBuy, enabled: false, firedAt: new Date().toISOString(), lastPurchaseId: autoBuy.id };
      const pending = autoBuy.status === "pending_approval";
      autoBuyChannels = await dispatch({ productId: p.id, productName: p.name, price: best.effectivePrice, drop: 0, retailer: best.retailer,
        title: pending ? `Approve auto-buy: ${p.name}` : autoBuy.status === "completed" ? `Auto-bought: ${p.name}` : `Auto-buy failed: ${p.name}`,
        body: `${best.retailer}: $${best.effectivePrice.toFixed(2)} (${decision.reason}). ${pending ? "Your PayPal order is ready — tap to approve." : autoBuy.status === "completed" ? `Paid with PayPal sandbox, order ${autoBuy.order_id}.` : autoBuy.note ?? ""}`,
        url: pending && autoBuy.approve_url ? autoBuy.approve_url : `${appUrl(origin).replace(/\/$/, "")}/#purchases` });
    }
    await run("UPDATE watches SET last_price = ?, opts = ? WHERE visitor = ? AND product_id = ?", [best.effectivePrice, serializeWatchOpts(nextOpts), currentVisitor(), p.id]);
    if (autoBuy) { out.push({ productId: p.id, price: best.effectivePrice, alerted: true, autoBuy, channels: autoBuyChannels }); continue; }
    if (!reasons.length) { out.push({ productId: p.id, price: best.effectivePrice, alerted: false }); continue; }
    const alert = buildAlert(p.id, p.name, best, prev, reasons, appUrl(origin));
    out.push({ productId: p.id, price: best.effectivePrice, alerted: true, alert, channels: await dispatch(alert) });
  }
  return out;
}

/** Cron entry point: run the watch + price-protection checks once per visitor, each with that visitor's own prefs, caps and channels. */
export async function checkAllVisitors(origin?: string) {
  const { checkProtection } = await import("../protection");
  const visitors = await listVisitors();
  const results: Array<Record<string, unknown>> = []; const protection: Array<Record<string, unknown>> = [];
  for (const v of visitors) await withVisitor(v, async () => {
    for (const r of await checkWatches(origin)) results.push({ ...r });
    for (const r of await checkProtection(appUrl(origin))) protection.push({ ...r });
  });
  return { visitors: visitors.length, results, protection };
}
