import { NextResponse } from "next/server";
import { captureOrder } from "@/lib/paypal";
import { getDb, recordOrder } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!/^[A-Z0-9]{10,40}$/.test(orderId || "")) return NextResponse.json({ error: "bad order id" }, { status: 400 });
    const c = await captureOrder(orderId);
    const db = await getDb(); const row = db.exec("SELECT product_id, retailer, amount FROM orders WHERE id = ?", [orderId])[0]?.values[0];
    if (row) await recordOrder(orderId, String(row[0]), String(row[1]), Number(row[2]), c.status);
    return NextResponse.json(c);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
