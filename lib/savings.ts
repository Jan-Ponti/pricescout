import { getProduct } from "./catalog";
type P = { product_id: string; amount: number; status: string };
/** Total saved vs MSRP across purchases that weren't failed/cancelled. Never negative per item. */
export function totalSaved(ps: P[]): { saved: number; count: number } {
  let saved = 0, count = 0;
  for (const p of ps) {
    if (p.status === "failed" || p.status === "cancelled") continue;
    const msrp = getProduct(p.product_id)?.msrp;
    if (msrp == null) continue;
    count++; saved += Math.max(0, msrp - Number(p.amount));
  }
  return { saved: Math.round(saved * 100) / 100, count };
}
/** Purchases made by the agent (auto-buy) that the client hasn't toasted yet. */
export function newAutoBuys<T extends { id: string; source: string; order_id: string | null }>(ps: T[], seen: Set<string>): T[] {
  return ps.filter((p) => p.source === "auto-buy" && p.order_id && !seen.has(p.id));
}
