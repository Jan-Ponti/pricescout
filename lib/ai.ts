import OpenAI from "openai";
import { CATALOG, matchProduct } from "./catalog";
import { predictionBlurb } from "./predict";
import type { Product, Deal, Insight, ShopperPrefs } from "./types";
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

export function ruleAdvice(p: Product, deals: Deal[], ins: Insight, prefs?: ShopperPrefs) {
  const b = deals[0];
  const pred = ins.prediction ? predictionBlurb(ins.prediction) : "";
  const taxNote = b.tax > 0 ? ` Est. tax $${b.tax.toFixed(2)} → **total ~$${b.totalCost.toFixed(2)}**${prefs?.zip ? ` (ZIP ${prefs.zip})` : ""}.` : "";
  const budgetNote = prefs?.budget != null
    ? (b.totalCost <= prefs.budget ? ` Fits your $${prefs.budget} budget.` : ` Over your $${prefs.budget} budget by $${(b.totalCost - prefs.budget).toFixed(2)}.`)
    : "";
  const scoreNote = ` Deal score **${b.score}/100**.`;
  return `I found **${p.name}** at ${deals.length} retailers. Best deal: **${b.retailer}** at $${b.effectivePrice.toFixed(2)}${b.coupon ? ` with code \`${b.coupon.code}\` (saves $${b.discount.toFixed(2)})` : ""}.${taxNote}${budgetNote}${scoreNote} ${pred}${ins.lowest ? ` Lowest tracked: $${ins.lowest.price.toFixed(2)} at ${ins.lowest.retailer} on ${ins.lowest.date}.` : ""} Say "buy it" or press Checkout to pay with PayPal — I'll only charge after you approve.`;
}
export async function advise(p: Product, deals: Deal[], ins: Insight, prefs?: ShopperPrefs): Promise<{ text: string; via: "llm" | "rules" }> {
  const fallback = ruleAdvice(p, deals, ins, prefs);
  if (!aiEnabled()) return { text: fallback, via: "rules" };
  try {
    const r = await client().chat.completions.create({
      model: model(), temperature: 0.4,
      messages: [
        { role: "system", content: "You are a concise shopping agent. In <=100 words using markdown bold, recommend the best deal (mention total cost with tax if present), deal score, coupon if any, and buy/wait/watch based on facts.prediction.verdict. Never invent numbers. Your recommendation MUST match facts.prediction.verdict and facts.ruleVerdict. End by saying the user can approve a PayPal checkout." },
        { role: "user", content: JSON.stringify({
          product: p.name, prefs,
          deals: deals.slice(0, 5).map(({ retailer, price, shipping, discount, effectivePrice, totalCost, tax, score, inStock, coupon, condition, etaDays }) =>
            ({ retailer, price, shipping, discount, effectivePrice, totalCost, tax, score, inStock, coupon: coupon?.code, condition, etaDays })),
          history: { lowest: ins.lowest, avg90: ins.avg90, current: ins.current },
          prediction: ins.prediction,
          facts: { ruleVerdict: fallback },
        }) },
      ],
    });
    return { text: r.choices[0].message.content || fallback, via: "llm" };
  } catch (e) { console.warn("LLM advise failed:", (e as Error).message); return { text: fallback, via: "rules" }; }
}
export const wantsToBuy = (m: string) => /\b(buy|checkout|check out|purchase|order it|get it)\b/i.test(m);
