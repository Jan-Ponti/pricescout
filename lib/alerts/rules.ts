import type { Deal } from "../types";
export interface AlertReason { kind: "target" | "drop"; message: string }
/** Pure decision logic: alert when price is at/below target, or dropped vs. last snapshot by >= minDropPct. */
export function evaluate(prev: number | null, next: number, target: number | null, minDropPct = 1): AlertReason[] {
  const out: AlertReason[] = [];
  if (target != null && next <= target && (prev == null || prev > target)) out.push({ kind: "target", message: `Now $${next.toFixed(2)}, at or below your $${target.toFixed(2)} target` });
  if (prev != null && next < prev && ((prev - next) / prev) * 100 >= minDropPct) out.push({ kind: "drop", message: `Dropped $${(prev - next).toFixed(2)} (from $${prev.toFixed(2)})` });
  return out;
}
export interface Alert { productId: string; productName: string; title: string; body: string; url: string; price: number; drop: number; retailer: string; coupon?: string }
export function buildAlert(productId: string, productName: string, deal: Deal, prev: number | null, reasons: AlertReason[], appUrl: string): Alert {
  const drop = prev != null ? Math.max(0, Math.round((prev - deal.effectivePrice) * 100) / 100) : 0;
  const url = `${appUrl.replace(/\/$/, "")}/?buy=${encodeURIComponent(productId)}&retailer=${encodeURIComponent(deal.retailer)}`;
  const body = `${deal.retailer}: $${deal.effectivePrice.toFixed(2)}${drop ? ` (↓ $${drop.toFixed(2)})` : ""}${deal.coupon ? ` with code ${deal.coupon.code}` : ""}. ${reasons.map((r) => r.message).join("; ")}.`;
  return { productId, productName, title: `Price drop: ${productName}`, body, url, price: deal.effectivePrice, drop, retailer: deal.retailer, coupon: deal.coupon?.code };
}
