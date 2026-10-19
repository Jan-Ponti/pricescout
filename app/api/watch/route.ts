import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { analyze } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await query("SELECT * FROM watches ORDER BY created DESC")); }
export async function POST(req: Request) {
  const { productId, target } = await req.json(); const p = getProduct(productId);
  if (!p) return NextResponse.json({ error: "unknown product" }, { status: 400 });
  const t = target === "" || target == null ? null : Number(target);
  if (t != null && !(t > 0)) return NextResponse.json({ error: "bad target" }, { status: 400 });
  const { deals } = await analyze(p);
  await run("INSERT OR REPLACE INTO watches VALUES (?,?,?,?)", [p.id, t, deals[0].effectivePrice, new Date().toISOString()]);
  return NextResponse.json({ ok: true, productId: p.id, target: t, last_price: deals[0].effectivePrice });
}
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("productId"); await run("DELETE FROM watches WHERE product_id = ?", [id]);
  await run("DELETE FROM sim_drops WHERE product_id = ?", [id]); return NextResponse.json({ ok: true });
}
