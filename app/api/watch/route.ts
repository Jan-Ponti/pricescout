import { NextResponse } from "next/server";
import { query, run, parseWatchOpts, serializeWatchOpts } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { analyze } from "@/lib/service";
import type { WatchOpts } from "@/lib/types";
export const dynamic = "force-dynamic";

function rowOut(w: Record<string, any>) {
  return { ...w, opts: parseWatchOpts(w.opts) };
}

export async function GET() {
  return NextResponse.json((await query("SELECT * FROM watches ORDER BY created DESC")).map(rowOut));
}
export async function POST(req: Request) {
  const body = await req.json();
  const { productId, target } = body;
  const p = getProduct(productId);
  if (!p) return NextResponse.json({ error: "unknown product" }, { status: 400 });
  const t = target === "" || target == null ? null : Number(target);
  if (t != null && !(t > 0)) return NextResponse.json({ error: "bad target" }, { status: 400 });
  const { deals } = await analyze(p);
  const best = deals[0];
  const existing = (await query("SELECT opts FROM watches WHERE product_id = ?", [p.id]))[0];
  const prev = parseWatchOpts(existing?.opts);
  const opts: WatchOpts = {
    ...prev,
    alertAtl: body.alertAtl != null ? !!body.alertAtl : !!prev.alertAtl,
    nearLowPct: body.nearLowPct === "" || body.nearLowPct == null ? (body.nearLowPct === "" ? null : (prev.nearLowPct ?? null)) : Number(body.nearLowPct),
    alertStock: body.alertStock != null ? !!body.alertStock : !!prev.alertStock,
    alertCoupon: body.alertCoupon != null ? !!body.alertCoupon : !!prev.alertCoupon,
    lastInStock: best.inStock,
    lastHadCoupon: !!best.coupon,
  };
  if (opts.nearLowPct != null && !(opts.nearLowPct > 0)) opts.nearLowPct = null;
  await run(
    "INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)",
    [p.id, t, best.effectivePrice, new Date().toISOString(), serializeWatchOpts(opts)],
  );
  return NextResponse.json({ ok: true, productId: p.id, target: t, last_price: best.effectivePrice, opts });
}
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("productId"); await run("DELETE FROM watches WHERE product_id = ?", [id]);
  await run("DELETE FROM sim_drops WHERE product_id = ?", [id]); return NextResponse.json({ ok: true });
}
