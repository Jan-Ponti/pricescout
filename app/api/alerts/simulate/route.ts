import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { checkWatches, appUrl } from "@/lib/alerts/checker";
import { checkProtection } from "@/lib/protection";
export const dynamic = "force-dynamic";
/** Demo button: knock the (mock) price down ~12% for a watched product, then run the same checker the cron job runs. */
export async function POST(req: Request) {
  const { productId, pct = 12 } = await req.json();
  const bought = (await query("SELECT 1 FROM purchases WHERE product_id = ? AND status = 'completed'", [productId])).length > 0;
  if (!bought && !(await query("SELECT 1 FROM watches WHERE product_id = ?", [productId])).length) return NextResponse.json({ error: "Watch this product first" }, { status: 400 });
  const cur = Number((await query("SELECT factor FROM sim_drops WHERE product_id = ?", [productId]))[0]?.factor ?? 1);
  await run("INSERT OR REPLACE INTO sim_drops VALUES (?,?)", [productId, Math.max(0.3, cur * (1 - Number(pct) / 100))]);
  const results = await checkWatches(new URL(req.url).origin);
  const protection = await checkProtection(appUrl(new URL(req.url).origin));
  return NextResponse.json({ results: results.filter((r) => r.productId === productId), protection });
}
