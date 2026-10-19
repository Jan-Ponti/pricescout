import type { Offer, Coupon, Deal } from "./types";
import { round2 } from "./rand";
export function couponDiscount(o: Offer, c: Coupon): number {
  if (!c.verified || c.retailer !== o.retailer) return 0;
  const base = o.price;
  if (c.minSpend && base < c.minSpend) return 0;
  if (c.code === "FREESHIP") return o.shipping;
  let d = c.type === "percent" ? (base * c.value) / 100 : c.value;
  if (c.code === "NEWBUYER15") d = Math.min(d, 40);
  return round2(Math.min(d, base));
}
export function bestDeals(offers: Offer[], coupons: Coupon[]): Deal[] {
  return offers.map((o) => {
    let coupon: Coupon | undefined; let discount = 0;
    for (const c of coupons) { const d = couponDiscount(o, c); if (d > discount) { discount = d; coupon = c; } }
    return { ...o, coupon, discount, effectivePrice: round2(o.price + o.shipping - discount) };
  }).sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.effectivePrice - b.effectivePrice);
}
