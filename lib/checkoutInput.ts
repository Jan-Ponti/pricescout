import { getProduct } from "./catalog";
import { analyze } from "./service";
import type { CheckoutInput } from "./paypal";
/** Re-price server-side so the client can't tamper with amounts. */
export async function buildCheckout(req: Request, productId: string, retailer?: string) {
  const p = getProduct(productId); if (!p) throw new Error("unknown product");
  const { deals } = await analyze(p);
  const d = deals.find((x) => x.retailer === retailer) ?? deals[0];
  const origin = new URL(req.url).origin;
  const input: CheckoutInput = { name: p.name, retailer: d.retailer, price: d.price, shipping: d.shipping, discount: d.discount,
    returnUrl: `${origin}/checkout/return`, cancelUrl: `${origin}/?cancelled=1` };
  return { p, d, input };
}
