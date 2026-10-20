import OpenAI from "openai";
import { CATALOG, matchProduct } from "./catalog";
import type { Product, Deal } from "./types";
export const aiEnabled = () => Boolean(process.env.OPENAI_API_KEY);
const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: process.env.OPENAI_BASE_URL || undefined });
const model = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

/** Identify which product the user means. LLM maps free text ("those sony noise cancelling cans") to a catalog id; falls back to fuzzy matching. */
export async function identifyProduct(message: string): Promise<{ product: Product | null; via: "llm" | "rules" }> {
  if (aiEnabled()) {
    try {
      const r = await client().chat.completions.create({
        model: model(), temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `You map a shopper's request to one product id from this catalog, or null. Reply JSON {"id": string|null}.\n${CATALOG.map((p) => `${p.id}: ${p.name}`).join("\n")}` },
          { role: "user", content: message },
        ],
      });
      const id = JSON.parse(r.choices[0].message.content || "{}").id;
      if (id === null) return { product: null, via: "llm" };
      const product = CATALOG.find((p) => p.id === id);
      if (product) return { product, via: "llm" };
      return { product: matchProduct(message), via: "rules" };
    } catch (e) { console.warn("LLM identify failed, using rules:", (e as Error).message); }
  }
  return { product: matchProduct(message), via: "rules" };
}

export interface Insight { lowest: { date: string; price: number; retailer: string } | null; avg90: number; current: number }
export function ruleAdvice(p: Product, deals: Deal[], ins: Insight) {
  const b = deals[0]; const vsAvg = ((b.effectivePrice - ins.avg90) / ins.avg90) * 100;
  const verdict = ins.lowest && b.effectivePrice <= ins.lowest.price * 1.03 ? "That's at or near the all-time low — a strong time to buy."
    : vsAvg < -3 ? `That's ${Math.abs(vsAvg).toFixed(0)}% below the 90-day average — a good deal.`
    : vsAvg > 3 ? `That's ${vsAvg.toFixed(0)}% above the 90-day average; prices have dipped lower before, so waiting could pay off.`
    : "That's about the 90-day average price.";
  return `I found **${p.name}** at ${deals.length} retailers. Best deal: **${b.retailer}** at $${b.effectivePrice.toFixed(2)}${b.coupon ? ` with code \`${b.coupon.code}\` (saves $${b.discount.toFixed(2)})` : ""}. ${verdict}${ins.lowest ? ` Lowest tracked: $${ins.lowest.price.toFixed(2)} at ${ins.lowest.retailer} on ${ins.lowest.date}.` : ""} Say "buy it" or press Checkout to pay with PayPal — I'll only charge after you approve.`;
}
export async function advise(p: Product, deals: Deal[], ins: Insight): Promise<{ text: string; via: "llm" | "rules" }> {
  const fallback = ruleAdvice(p, deals, ins);
  if (!aiEnabled()) return { text: fallback, via: "rules" };
  try {
    const r = await client().chat.completions.create({
      model: model(), temperature: 0.4,
      messages: [
        { role: "system", content: "You are a concise shopping agent. In <=90 words using markdown bold, recommend the best deal, mention the coupon if any, and say whether to buy now or wait based on price history. Never invent numbers; use only the provided data. facts.bestVs90DayAvgPercent negative means the best price is BELOW the average (good). Your buy-now-or-wait recommendation MUST match facts.ruleVerdict; do not contradict it or describe the price as above average when bestVs90DayAvgPercent is negative. End by saying the user can approve a PayPal checkout." },
        { role: "user", content: JSON.stringify({ product: p.name, deals: deals.slice(0, 5).map(({ retailer, price, shipping, discount, effectivePrice, inStock, coupon }) => ({ retailer, price, shipping, discount, effectivePrice, inStock, coupon: coupon?.code })), history: ins, facts: { bestVs90DayAvgPercent: Math.round(((deals[0].effectivePrice - ins.avg90) / ins.avg90) * 1000) / 10, ruleVerdict: fallback } }) },
      ],
    });
    return { text: r.choices[0].message.content || fallback, via: "llm" };
  } catch (e) { console.warn("LLM advise failed:", (e as Error).message); return { text: fallback, via: "rules" }; }
}
export const wantsToBuy = (m: string) => /\b(buy|checkout|check out|purchase|order it|get it)\b/i.test(m);
