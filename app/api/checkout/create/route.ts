import { NextResponse } from "next/server";
import { createOrder } from "@/lib/paypal";
import { buildCheckout } from "@/lib/checkoutInput";
import { recordOrder } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { productId, retailer, approved } = await req.json();
    if (approved !== true) return NextResponse.json({ error: "Explicit user approval required" }, { status: 403 });
    const { p, d, input } = await buildCheckout(req, productId, retailer);
    const o = await createOrder(input);
    await recordOrder(o.id, p.id, d.retailer, d.effectivePrice, o.status);
    return NextResponse.json({ ...o, amount: d.effectivePrice });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
