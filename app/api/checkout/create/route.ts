import { NextResponse } from "next/server";
import { createOrder } from "@/lib/paypal";
import { buildCheckout } from "@/lib/checkoutInput";
import { recordOrder } from "@/lib/db";
import { addPurchase } from "@/lib/purchases";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { productId, retailer, approved } = await req.json();
    if (approved !== true) return NextResponse.json({ error: "Explicit user approval required" }, { status: 403 });
    const { p, d, input } = await buildCheckout(req, productId, retailer);
    const o = await createOrder(input);
    await recordOrder(o.id, p.id, d.retailer, d.effectivePrice, o.status);
    await addPurchase({ order_id: o.id, product_id: p.id, product_name: p.name, retailer: d.retailer, amount: d.effectivePrice, status: "pending_approval", mode: "approval", source: "chat", approve_url: o.approveUrl ?? null, note: `order via ${o.via}` });
    return NextResponse.json({ ...o, amount: d.effectivePrice });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
