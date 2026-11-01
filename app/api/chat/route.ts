import { NextResponse } from "next/server";
import { identifyProduct, advise, aiEnabled, wantsToBuy } from "@/lib/ai";
import { analyze } from "@/lib/service";
import { getProduct, CATALOG } from "@/lib/catalog";
import { parseConstraints, setPrefs, getPrefs } from "@/lib/prefs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { message, currentProductId } = await req.json();
  if (typeof message !== "string" || !message.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
  const current = currentProductId ? getProduct(currentProductId) : null;
  if (current && wantsToBuy(message) && message.split(" ").length < 6)
    return NextResponse.json({ reply: "Ready when you are — review the order summary and press **Approve & pay with PayPal**. Nothing is charged until you approve.", product: current, intent: "checkout", ai: aiEnabled() });

  const constraints = parseConstraints(message);
  if (Object.keys(constraints).length) await setPrefs(constraints);
  const prefs = await getPrefs();

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
  if (c.zip) bits.push(`ZIP ${c.zip}`);
  if (c.needBy) bits.push(`need by ${c.needBy}`);
  if (c.allowOpenBox) bits.push("open-box OK");
  if (c.allowRefurbished) bits.push("refurb OK");
  if (Array.isArray(c.memberships) && c.memberships.length) bits.push(c.memberships.join("/"));
  return bits.join(", ");
}
