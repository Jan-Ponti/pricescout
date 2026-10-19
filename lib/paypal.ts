import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { round2 } from "./rand";

const env = () => ({ id: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, live: process.env.PAYPAL_ENV === "live" });
export const paypalConfigured = () => Boolean(env().id && env().secret);
const base = () => (env().live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

let toolkit: PayPalAgentToolkit | null = null;
/** PayPal Agent Toolkit: exposes create_order / get_order / pay_order as LLM-callable tools. */
export function getToolkit() {
  if (!paypalConfigured()) return null;
  if (!toolkit) toolkit = new PayPalAgentToolkit({
    clientId: env().id!, clientSecret: env().secret!,
    configuration: { actions: { orders: { create: true, get: true, capture: true } }, context: { sandbox: !env().live } },
  });
  return toolkit;
}
async function callTool(name: string, args: unknown): Promise<any> {
  const tk = getToolkit(); if (!tk) throw new Error("PayPal not configured");
  const res = await tk.handleToolCall({ id: `call_${Date.now()}`, type: "function", function: { name, arguments: JSON.stringify(args) } } as any);
  const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error(`PayPal tool ${name} returned: ${text.slice(0, 300)}`); }
  if (j && j.ok === false) { const e = new Error(`PayPal ${name} failed (${j.status}): ${j.message}`); (e as any).business = true; throw e; }
  return j;
  try { return JSON.parse(text); } catch { throw new Error(`PayPal tool ${name} returned: ${text.slice(0, 300)}`); }
}
async function token() {
  const r = await fetch(`${base()}/v1/oauth2/token`, { method: "POST", body: "grant_type=client_credentials",
    headers: { Authorization: "Basic " + Buffer.from(`${env().id}:${env().secret}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" } });
  if (!r.ok) throw new Error(`PayPal OAuth failed (${r.status})`); return (await r.json()).access_token as string;
}
async function rest(path: string, body?: unknown) {
  const r = await fetch(`${base()}${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", "PayPal-Request-Id": crypto.randomUUID() } });
  const j = await r.json(); if (!r.ok) throw new Error(`PayPal ${path} ${r.status}: ${j.name ?? ""} ${j.message ?? ""}`); return j;
}

export interface CheckoutInput { name: string; retailer: string; price: number; shipping: number; discount: number; returnUrl: string; cancelUrl: string }
export interface CreatedOrder { id: string; status: string; approveUrl?: string; via: "agent-toolkit" | "orders-api" | "simulated" }

export async function createOrder(i: CheckoutInput): Promise<CreatedOrder> {
  if (!paypalConfigured()) return { id: `SIM${Date.now()}`, status: "CREATED", via: "simulated", approveUrl: `${i.returnUrl}?token=SIM${Date.now()}&simulated=1` };
  try {
    const o = await callTool("create_order", {
      currencyCode: "USD", items: [{ name: `${i.name} (${i.retailer})`.slice(0, 127), quantity: 1, itemCost: i.price, itemTotal: i.price, taxPercent: 0 }],
      discount: i.discount, shippingCost: i.shipping, returnUrl: i.returnUrl, cancelUrl: i.cancelUrl,
    });
    if (!o.id) throw new Error(JSON.stringify(o).slice(0, 300));
    return { id: o.id, status: o.status, approveUrl: o.links?.find((l: any) => /approve|payer-action/.test(l.rel))?.href, via: "agent-toolkit" };
  } catch (e) {
    console.warn("Agent Toolkit create_order failed, falling back to Orders v2:", (e as Error).message);
    const o = await rest("/v2/checkout/orders", {
      intent: "CAPTURE",
      purchase_units: [{ description: i.name.slice(0, 127), amount: { currency_code: "USD", value: round2(i.price + i.shipping - i.discount).toFixed(2) } }],
      payment_source: { paypal: { experience_context: { return_url: i.returnUrl, cancel_url: i.cancelUrl, user_action: "PAY_NOW", shipping_preference: "NO_SHIPPING" } } },
    });
    return { id: o.id, status: o.status, approveUrl: o.links?.find((l: any) => /approve|payer-action/.test(l.rel))?.href, via: "orders-api" };
  }
}

export interface Captured { id: string; status: string; captureId?: string; amount?: string; via: string }
const summarize = (o: any, via: string): Captured => {
  const c = o.purchase_units?.[0]?.payments?.captures?.[0];
  return { id: o.id, status: o.status, captureId: c?.id, amount: c?.amount?.value, via };
};
export async function captureOrder(id: string): Promise<Captured> {
  if (!paypalConfigured() || id.startsWith("SIM")) return { id, status: "COMPLETED", captureId: `SIMCAP${Date.now()}`, via: "simulated" };
  try { const o = await callTool("pay_order", { id }); if (typeof o.status === "string" && o.id) return summarize(o, "agent-toolkit"); throw new Error(JSON.stringify(o).slice(0, 300)); }
  catch (e) { if ((e as any).business) throw e; console.warn("Agent Toolkit pay_order failed, falling back:", (e as Error).message); return summarize(await rest(`/v2/checkout/orders/${id}/capture`), "orders-api"); }
}

/** Sandbox-only shortcut: pay with PayPal's public sandbox test card so the full create+capture flow runs without a buyer login. */
export async function sandboxCardCheckout(i: CheckoutInput): Promise<Captured> {
  if (env().live) throw new Error("Test-card checkout is sandbox only");
  if (!paypalConfigured()) return { id: `SIM${Date.now()}`, status: "COMPLETED", captureId: `SIMCAP${Date.now()}`, via: "simulated" };
  const o = await rest("/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ description: i.name.slice(0, 127), amount: { currency_code: "USD", value: round2(i.price + i.shipping - i.discount).toFixed(2) } }],
    payment_source: { card: { number: "4032039317984658", expiry: "2030-12", security_code: "123", name: "Sandbox Buyer" } },
  });
  if (o.status === "COMPLETED") return summarize(o, "orders-api (sandbox card)");
  return summarize(await rest(`/v2/checkout/orders/${o.id}/capture`), "orders-api (sandbox card)");
}
