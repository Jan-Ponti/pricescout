import type { Deal } from "../types";
export interface AlertReason { kind: "target" | "drop" | "atl" | "near_low" | "stock" | "coupon"; message: string }
export interface EvaluateOpts {
  target?: number | null;
  minDropPct?: number;
  lowest?: number | null;
  nearLowPct?: number | null;
  alertAtl?: boolean;
  alertStock?: boolean;
  alertCoupon?: boolean;
  wasInStock?: boolean | null;
  nowInStock?: boolean;
  hadCoupon?: boolean | null;
  hasCoupon?: boolean;
}
/** Pure decision logic for price / stock / coupon alert reasons. */
export function evaluate(prev: number | null, next: number, targetOrOpts: number | null | EvaluateOpts = null, maybeMinDrop?: number): AlertReason[] {
  const opts: EvaluateOpts = targetOrOpts != null && typeof targetOrOpts === "object"
    ? targetOrOpts
    : { target: targetOrOpts as number | null, minDropPct: maybeMinDrop };
  const target = opts.target ?? null;
  const minDropPct = opts.minDropPct ?? 1;
  const out: AlertReason[] = [];
  if (target != null && next <= target && (prev == null || prev > target)) out.push({ kind: "target", message: `Now $${next.toFixed(2)}, at or below your $${target.toFixed(2)} target` });
  if (prev != null && next < prev && ((prev - next) / prev) * 100 >= minDropPct) out.push({ kind: "drop", message: `Dropped $${(prev - next).toFixed(2)} (from $${prev.toFixed(2)})` });
  if (opts.alertAtl && opts.lowest != null && next <= opts.lowest * 1.001 && (prev == null || prev > opts.lowest * 1.001))
    out.push({ kind: "atl", message: `Hit the all-time low ($${opts.lowest.toFixed(2)})` });
  if (opts.nearLowPct != null && opts.nearLowPct > 0 && opts.lowest != null) {
    const ceiling = opts.lowest * (1 + opts.nearLowPct / 100);
    if (next <= ceiling && (prev == null || prev > ceiling))
      out.push({ kind: "near_low", message: `Within ${opts.nearLowPct}% of the all-time low ($${opts.lowest.toFixed(2)})` });
  }
  if (opts.alertStock && opts.wasInStock === false && opts.nowInStock === true)
    out.push({ kind: "stock", message: "Back in stock at the best retailer" });
  if (opts.alertCoupon && opts.hadCoupon === false && opts.hasCoupon === true)
    out.push({ kind: "coupon", message: "A new coupon appeared on the best deal" });
  return out;
}
export interface Alert { productId: string; productName: string; title: string; body: string; url: string; price: number; drop: number; retailer: string; coupon?: string }
export function buildAlert(productId: string, productName: string, deal: Deal, prev: number | null, reasons: AlertReason[], appUrl: string): Alert {
  const drop = prev != null ? Math.max(0, Math.round((prev - deal.effectivePrice) * 100) / 100) : 0;
  const url = `${appUrl.replace(/\/$/, "")}/?buy=${encodeURIComponent(productId)}&retailer=${encodeURIComponent(deal.retailer)}`;
  const body = `${deal.retailer}: $${deal.effectivePrice.toFixed(2)}${drop ? ` (↓ $${drop.toFixed(2)})` : ""}${deal.coupon ? ` with code ${deal.coupon.code}` : ""}. ${reasons.map((r) => r.message).join("; ")}.`;
  const title = reasons.some((r) => r.kind === "stock") ? `Back in stock: ${productName}`
    : reasons.some((r) => r.kind === "coupon") ? `New coupon: ${productName}`
    : reasons.some((r) => r.kind === "atl" || r.kind === "near_low") ? `Great price: ${productName}`
    : `Price drop: ${productName}`;
  return { productId, productName, title, body, url, price: deal.effectivePrice, drop, retailer: deal.retailer, coupon: deal.coupon?.code };
}
