export type Condition = "new" | "open_box" | "refurbished";
export interface Product { id: string; name: string; brand: string; category: string; image: string; msrp: number; aliases: string[] }
export interface Offer {
  retailer: string; price: number; shipping: number; inStock: boolean; url: string; source: "mock" | "live";
  condition?: Condition; etaDays?: number; sellerRating?: number; membership?: "none" | "prime" | "plus" | "walmart+";
}
export interface Coupon { code: string; retailer: string; description: string; type: "percent" | "fixed"; value: number; minSpend?: number; verified: boolean; source: "mock" | "live" }
export interface Deal extends Offer {
  coupon?: Coupon; discount: number; effectivePrice: number;
  tax: number; membershipSave: number; totalCost: number;
  score: number; scoreReasons: string[];
}
export interface PricePoint { date: string; retailer: string; price: number }
export interface PriceProvider { name: string; getOffers(p: Product): Promise<Offer[]>; getSeedHistory?(p: Product, days: number): PricePoint[] }
export interface CouponProvider { name: string; getCoupons(p: Product, retailers: string[]): Promise<Coupon[]> }
export interface ShopperPrefs {
  zip?: string; budget?: number; needBy?: string; allowOpenBox?: boolean; allowRefurbished?: boolean;
  memberships?: Array<"prime" | "plus" | "walmart+">;
}
export interface WatchOpts {
  alertAtl?: boolean; nearLowPct?: number | null; alertStock?: boolean; alertCoupon?: boolean;
  lastInStock?: boolean | null; lastHadCoupon?: boolean | null;
}
export interface Insight {
  lowest: { date: string; price: number; retailer: string } | null;
  avg90: number; current: number;
  prediction?: Prediction;
}
export interface Prediction {
  verdict: "buy" | "wait" | "watch";
  confidence: number;
  reasons: string[];
  nextSale?: { label: string; approxDate: string; expectedDropPct: number } | null;
  vsAvgPct: number; vsLowPct: number | null;
}
