import type { AutoBuyOpts, Deal, Product } from "./types";
import { createOrder, sandboxCardCheckout, type CheckoutInput } from "./paypal";
import { addPurchase, spentThisMonth, type Purchase } from "./purchases";

export interface AutoBuyDecision { buy: boolean; reason: string }
/** Pure decision: should the agent buy now? Never exceeds maxPrice or the monthly cap. */
export function decideAutoBuy(ab: AutoBuyOpts | undefined, deal: Pick<Deal, "effectivePrice" | "inStock">, spent: number, extraCap?: number | null): AutoBuyDecision {
  if (!ab?.enabled) return { buy: false, reason: "auto-buy off" };
  if (ab.maxPrice == null || !(ab.maxPrice > 0)) return { buy: false, reason: "no max price set" };
  if (!deal.inStock) return { buy: false, reason: "out of stock" };
  const price = deal.effectivePrice;
  if (price > ab.maxPrice) return { buy: false, reason: `$${price.toFixed(2)} is above max $${ab.maxPrice.toFixed(2)}` };
  const caps = [ab.monthlyCap, extraCap].filter((c): c is number => c != null && c > 0);
  for (const cap of caps) if (spent + price > cap + 1e-9) return { buy: false, reason: `would exceed monthly cap ($${spent.toFixed(2)} spent + $${price.toFixed(2)} > $${cap.toFixed(2)})` };
  return { buy: true, reason: `$${price.toFixed(2)} ≤ max $${ab.maxPrice.toFixed(2)}${caps.length ? `, within monthly cap` : ""}` };
}
/** "auto" mode only captures without a click in the PayPal sandbox (public sandbox test card); live always falls back to approval. */
export const canFullyAuto = () => process.env.PAYPAL_ENV !== "live";

export async function executeAutoBuy(p: Product, deal: Deal, ab: AutoBuyOpts, origin: string): Promise<Purchase> {
  const base = origin.replace(/\/$/, "");
  const input: CheckoutInput = { name: p.name, retailer: deal.retailer, price: deal.price, shipping: deal.shipping, discount: deal.discount,
    returnUrl: `${base}/checkout/return`, cancelUrl: `${base}/?cancelled=1` };
  const common = { product_id: p.id, product_name: p.name, retailer: deal.retailer, amount: deal.effectivePrice, source: "auto-buy" };
  if (ab.mode === "auto" && canFullyAuto()) {
    try {
      const c = await sandboxCardCheckout(input);
      return addPurchase({ ...common, order_id: c.id, status: c.status === "COMPLETED" ? "completed" : "failed", mode: "auto", approve_url: null, note: `captured via ${c.via}` });
    } catch (e) {
      return addPurchase({ ...common, order_id: null, status: "failed", mode: "auto", approve_url: null, note: (e as Error).message.slice(0, 300) });
    }
  }
  const o = await createOrder(input);
  return addPurchase({ ...common, order_id: o.id, status: "pending_approval", mode: "approval", approve_url: o.approveUrl ?? null,
    note: ab.mode === "auto" ? "fully automatic is sandbox-only; fell back to approval" : `order via ${o.via}` });
}
export { spentThisMonth };
