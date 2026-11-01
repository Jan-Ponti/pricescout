import { NextResponse } from "next/server";
import { captureOrder } from "@/lib/paypal";
import { query, recordOrder } from "@/lib/db";
import { setPurchaseStatusByOrder } from "@/lib/purchases";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!/^[A-Z0-9]{10,40}$/.test(orderId || "")) return NextResponse.json({ error: "bad order id" }, { status: 400 });
    const c = await captureOrder(orderId);
    const row = (await query("SELECT product_id, retailer, amount FROM orders WHERE id = ?", [orderId]))[0];
    if (row) await recordOrder(orderId, String(row.product_id), String(row.retailer), Number(row.amount), c.status);
    await setPurchaseStatusByOrder(orderId, c.status === "COMPLETED" ? "completed" : "failed");
    return NextResponse.json(c);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
