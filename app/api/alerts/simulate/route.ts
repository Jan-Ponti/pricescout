import { publicOrigin } from "@/lib/origin";
import { currentVisitor, vk } from "@/lib/visitor";
import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
import { checkWatches, appUrl } from "@/lib/alerts/checker";
import { checkProtection } from "@/lib/protection";
export const dynamic = "force-dynamic";
/** Demo button: knock the (mock) price down ~12% for a watched product, then run the same checker the cron job runs. */
export async function POST(req: Request) {
  const { productId, pct = 12 } = await req.json();
  const bought = (await query("SELECT 1 FROM purchases WHERE visitor = ? AND product_id = ? AND status = 'completed'", [currentVisitor(), productId])).length > 0;
  if (!bought && !(await query("SELECT 1 FROM watches WHERE visitor = ? AND product_id = ?", [currentVisitor(), productId])).length) return NextResponse.json({ error: "Watch this product first" }, { status: 400 });
  const cur = Number((await query("SELECT factor FROM sim_drops WHERE visitor = ? AND product_id = ?", [currentVisitor(), productId]))[0]?.factor ?? 1);
  await run("INSERT OR REPLACE INTO sim_drops (visitor, product_id, factor) VALUES (?,?,?)", [currentVisitor(), productId, Math.max(0.3, cur * (1 - Number(pct) / 100))]);
  const results = await checkWatches(publicOrigin(req));
  const protection = await checkProtection(appUrl(publicOrigin(req)));
  return NextResponse.json({ results: results.filter((r) => r.productId === productId), protection });
}
