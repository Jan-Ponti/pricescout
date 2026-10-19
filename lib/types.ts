export interface Product { id: string; name: string; brand: string; category: string; image: string; msrp: number; aliases: string[] }
export interface Offer { retailer: string; price: number; shipping: number; inStock: boolean; url: string; source: "mock" | "live" }
export interface Coupon { code: string; retailer: string; description: string; type: "percent" | "fixed"; value: number; minSpend?: number; verified: boolean; source: "mock" | "live" }
export interface Deal extends Offer { coupon?: Coupon; discount: number; effectivePrice: number }
export interface PricePoint { date: string; retailer: string; price: number }
export interface PriceProvider { name: string; getOffers(p: Product): Promise<Offer[]>; getSeedHistory?(p: Product, days: number): PricePoint[] }
export interface CouponProvider { name: string; getCoupons(p: Product, retailers: string[]): Promise<Coupon[]> }
