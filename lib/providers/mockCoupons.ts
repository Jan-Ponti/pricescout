import type { CouponProvider, Coupon, Product } from "../types";
import { seeded } from "../rand";
/** MOCK provider: plausible coupon codes per retailer, deterministic per product. */
const TEMPLATES: Omit<Coupon, "retailer" | "verified" | "source">[] = [
  { code: "SAVE10", description: "10% off sitewide", type: "percent", value: 10 },
  { code: "TECH20OFF", description: "$20 off orders over $150", type: "fixed", value: 20, minSpend: 150 },
  { code: "NEWBUYER15", description: "15% off first order (max $40)", type: "percent", value: 15 },
  { code: "FREESHIP", description: "Free shipping", type: "fixed", value: 6.99 },
  { code: "FALL25", description: "$25 off orders over $250", type: "fixed", value: 25, minSpend: 250 },
  { code: "EXPIRED5", description: "5% off (reported expired)", type: "percent", value: 5 },
];
export const mockCouponProvider: CouponProvider = {
  name: "Mock coupon feed (simulated)",
  async getCoupons(p: Product, retailers: string[]) {
    const out: Coupon[] = [];
    for (const r of retailers) {
      const rnd = seeded(`${p.id}:${r}:coupons`);
      for (const t of TEMPLATES) {
        if (rnd() > 0.6) continue;
        if (t.code === "FREESHIP" && r !== "eBay") continue;
        out.push({ ...t, retailer: r, verified: t.code !== "EXPIRED5", source: "mock" });
      }
    }
    return out;
  },
};
