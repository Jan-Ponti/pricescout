import { NextResponse } from "next/server";
import { sandboxCardCheckout } from "@/lib/paypal";
import { buildCheckout } from "@/lib/checkoutInput";
import { recordOrder } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { productId, retailer, approved } = await req.json();
    if (approved !== true) return NextResponse.json({ error: "Explicit user approval required" }, { status: 403 });
    const { p, d, input } = await buildCheckout(req, productId, retailer);
    const c = await sandboxCardCheckout(input);
    await recordOrder(c.id, p.id, d.retailer, d.effectivePrice, c.status);
    return NextResponse.json({ ...c, expected: d.effectivePrice.toFixed(2) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
