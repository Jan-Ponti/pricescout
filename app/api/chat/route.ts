import { NextResponse } from "next/server";
import { identifyProduct, advise, aiEnabled, wantsToBuy } from "@/lib/ai";
import { analyze } from "@/lib/service";
import { getProduct, CATALOG } from "@/lib/catalog";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const { message, currentProductId } = await req.json();
  if (typeof message !== "string" || !message.trim()) return NextResponse.json({ error: "message required" }, { status: 400 });
  const current = currentProductId ? getProduct(currentProductId) : null;
  if (current && wantsToBuy(message) && message.split(" ").length < 6)
    return NextResponse.json({ reply: "Ready when you are — review the order summary and press **Approve & pay with PayPal**. Nothing is charged until you approve.", product: current, intent: "checkout", ai: aiEnabled() });
  const { product, via } = await identifyProduct(message);
  if (!product) return NextResponse.json({ reply: `I couldn't pin down that product. In this demo I can track: ${CATALOG.map((p) => p.name).join(", ")}.`, product: null, ai: aiEnabled(), via });
  const a = await analyze(product);
  const adv = await advise(product, a.deals, a.insight);
  return NextResponse.json({ reply: adv.text, product, ...a, ai: aiEnabled(), via: { identify: via, advice: adv.via }, intent: wantsToBuy(message) ? "checkout" : "analyze" });
}
