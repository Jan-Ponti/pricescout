import { NextResponse } from "next/server";
import { query, parseWatchOpts, getHistory } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { analyze } from "@/lib/service";
import { toSeries } from "@/lib/history";
import { round2 } from "@/lib/rand";
export const dynamic = "force-dynamic";

/** Enriched watchlist: current deal, % to target, sparkline, prediction. */
export async function GET() {
  const watches = await query("SELECT * FROM watches ORDER BY created DESC");
  const items = [];
  for (const w of watches) {
    const p = getProduct(String(w.product_id)); if (!p) continue;
    const a = await analyze(p);
    const best = a.deals[0];
    const target = w.target == null ? null : Number(w.target);
    const pctToTarget = target != null && best ? round2(((best.effectivePrice - target) / target) * 100) : null;
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { rows } = toSeries(await getHistory(p.id, since));
    const spark = rows.slice(-14).map((r) => Number(r.best));
    items.push({
      productId: p.id, product: p, target, last_price: Number(w.last_price), created: w.created,
      opts: parseWatchOpts(w.opts),
      best: best ? {
        retailer: best.retailer, effectivePrice: best.effectivePrice, totalCost: best.totalCost,
        tax: best.tax, score: best.score, coupon: best.coupon?.code, inStock: best.inStock, condition: best.condition,
      } : null,
      insight: a.insight, pctToTarget, spark,
    });
  }
  return NextResponse.json({ items, count: items.length });
}
