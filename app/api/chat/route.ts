import { NextResponse } from "next/server";
import { identifyProduct, advise, aiEnabled, wantsToBuy } from "@/lib/ai";
import { analyze } from "@/lib/service";
import { getProduct, CATALOG } from "@/lib/catalog";
import { findUrl, identifyFromUrl } from "@/lib/identify";
import { spentThisMonth } from "@/lib/purchases";
import { budgetStatus } from "@/lib/budget";
import { parseConstraints, setPrefs, getPrefs } from "@/lib/prefs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { message, currentProductId } = await req.json();
  if (typeof message !== "string" || !message.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
  const current = currentProductId ? getProduct(currentProductId) : null;
  if (current && wantsToBuy(message) && message.split(" ").length < 6)
    return NextResponse.json({ reply: "Ready when you are — review the order summary and press **Approve & pay with PayPal**. Nothing is charged until you approve.", product: current, intent: "checkout", ai: aiEnabled() });

  const url = findUrl(message);
  if (url) {
    const r = await identifyFromUrl(url);
    if (!r.product) return NextResponse.json({ reply: `I read that link${r.parsed ? ` (${r.parsed.domain}: "${r.parsed.words || "no product words"}")` : ""} but couldn't match it to a product I can track. In this demo I can track: ${CATALOG.map((p) => p.name).join(", ")}.`, product: null, ai: aiEnabled(), via: r.via });
    const a = await analyze(r.product, await getPrefs());
    const from = r.parsed?.retailer ? ` from ${r.parsed.retailer}` : "";
    return NextResponse.json({ reply: `That link${from} is **${r.product.name}**. Best total right now: **${a.deals[0].retailer}** at $${a.deals[0].totalCost.toFixed(2)}. Want me to start tracking it?`, product: r.product, ...a, ai: aiEnabled(), via: { identify: r.via }, intent: "analyze", offerTrack: true });
  }
  const constraints = parseConstraints(message);
  if (Object.keys(constraints).length) await setPrefs(constraints);
  const prefs = await getPrefs();

  if (/\b(how much (have i|did i) spen[dt]|spent so far|budget left|left (in|of) my budget)\b/i.test(message) || (constraints.monthlyBudget != null && Object.keys(constraints).length === 1 && message.split(" ").length < 10)) {
    const b = budgetStatus(await spentThisMonth(), prefs.monthlyBudget);
    return NextResponse.json({ reply: b.monthlyBudget ? `You've committed **$${b.spent.toFixed(2)}** of your **$${b.monthlyBudget.toFixed(2)}** monthly budget — **$${b.remaining!.toFixed(2)}** left. Auto-buy will never go over it.` : `You've committed **$${b.spent.toFixed(2)}** this month. Set a monthly budget (e.g. "monthly budget $500") and I'll keep purchases under it.`, product: null, prefs, ai: aiEnabled(), budget: b });
  }
  const { product, via } = await identifyProduct(message);
  if (!product) {
    const hint = Object.keys(constraints).length
      ? ` Saved your shopping prefs (${summarizePrefs(constraints)}).`
      : "";
    return NextResponse.json({ reply: `I couldn't pin down that product.${hint} In this demo I can track: ${CATALOG.map((p) => p.name).join(", ")}.`, product: null, prefs, ai: aiEnabled(), via });
  }
  const a = await analyze(product, prefs);
  const adv = await advise(product, a.deals, a.insight, prefs);
  const prefNote = Object.keys(constraints).length ? ` _(Applied: ${summarizePrefs(constraints)}.)_` : "";
  return NextResponse.json({ reply: adv.text + prefNote, product, ...a, prefs, ai: aiEnabled(), via: { identify: via, advice: adv.via }, intent: wantsToBuy(message) ? "checkout" : "analyze" });
}

function summarizePrefs(c: Record<string, unknown>) {
  const bits: string[] = [];
  if (c.budget != null) bits.push(`budget $${c.budget}`);
  if (c.monthlyBudget != null) bits.push(`monthly budget $${c.monthlyBudget}`);
  if (c.zip) bits.push(`ZIP ${c.zip}`);
  if (c.needBy) bits.push(`need by ${c.needBy}`);
  if (c.allowOpenBox) bits.push("open-box OK");
  if (c.allowRefurbished) bits.push("refurb OK");
  if (Array.isArray(c.memberships) && c.memberships.length) bits.push(c.memberships.join("/"));
  return bits.join(", ");
}
