import { currentVisitor, vk } from "@/lib/visitor";
import { NextResponse } from "next/server";
import { query, run, parseWatchOpts, serializeWatchOpts } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { analyze } from "@/lib/service";
import type { WatchOpts, AutoBuyOpts } from "@/lib/types";
export const dynamic = "force-dynamic";

function rowOut(w: Record<string, any>) {
  return { ...w, opts: parseWatchOpts(w.opts) };
}

function parseAutoBuy(raw: any, target: number | null): AutoBuyOpts {
  const num = (v: any) => (v === "" || v == null || !(Number(v) > 0) ? null : Number(v));
  return { enabled: !!raw.enabled, maxPrice: num(raw.maxPrice) ?? target, monthlyCap: num(raw.monthlyCap), mode: raw.mode === "auto" ? "auto" : "approval", firedAt: null, lastPurchaseId: null };
}
export async function GET() {
  return NextResponse.json((await query("SELECT * FROM watches WHERE visitor = ? ORDER BY created DESC", [currentVisitor()])).map(rowOut));
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
  const existing = (await query("SELECT opts FROM watches WHERE visitor = ? AND product_id = ?", [currentVisitor(), p.id]))[0];
  const prev = parseWatchOpts(existing?.opts);
  const opts: WatchOpts = {
    ...prev,
    alertAtl: body.alertAtl != null ? !!body.alertAtl : !!prev.alertAtl,
    nearLowPct: body.nearLowPct === "" || body.nearLowPct == null ? (body.nearLowPct === "" ? null : (prev.nearLowPct ?? null)) : Number(body.nearLowPct),
    alertStock: body.alertStock != null ? !!body.alertStock : !!prev.alertStock,
    alertCoupon: body.alertCoupon != null ? !!body.alertCoupon : !!prev.alertCoupon,
    autoBuy: body.autoBuy != null ? parseAutoBuy(body.autoBuy, t) : prev.autoBuy,
    lastInStock: best.inStock,
    lastHadCoupon: !!best.coupon,
  };
  if (opts.nearLowPct != null && !(opts.nearLowPct > 0)) opts.nearLowPct = null;
  await run(
    "INSERT OR REPLACE INTO watches (visitor, product_id, target, last_price, created, opts) VALUES (?,?,?,?,?,?)",
    [currentVisitor(), p.id, t, best.effectivePrice, new Date().toISOString(), serializeWatchOpts(opts)],
  );
  return NextResponse.json({ ok: true, productId: p.id, target: t, last_price: best.effectivePrice, opts });
}
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("productId"); await run("DELETE FROM watches WHERE visitor = ? AND product_id = ?", [currentVisitor(), id]);
  await run("DELETE FROM sim_drops WHERE visitor = ? AND product_id = ?", [currentVisitor(), id]); return NextResponse.json({ ok: true });
}
