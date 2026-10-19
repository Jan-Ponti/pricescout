import type { PriceProvider, CouponProvider } from "../types";
import { mockPriceProvider } from "./mockPrices";
import { mockCouponProvider } from "./mockCoupons";
/** Register additional live providers here (e.g. a retailer affiliate API). Each must implement PriceProvider / CouponProvider. */
export const priceProviders: PriceProvider[] = [mockPriceProvider];
export const couponProviders: CouponProvider[] = [mockCouponProvider];
