import type { PricePoint } from "./types";
export const RANGES = { "1W": 7, "1M": 30, "3M": 90, "1Y": 365, All: 100000 } as const;
export type Range = keyof typeof RANGES;
export function sinceFor(range: Range, now = Date.now()) {
  return range === "All" ? "0000" : new Date(now - RANGES[range] * 86400000).toISOString().slice(0, 10);
}
/** Collapse to one row per day: best price across retailers + each retailer column. */
export function toSeries(points: PricePoint[]) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const p of points) { const row = byDate.get(p.date) ?? { date: p.date }; row[p.retailer] = p.price; byDate.set(p.date, row); }
  const rows = [...byDate.values()].map((r) => {
    const prices = Object.entries(r).filter(([k]) => k !== "date").map(([, v]) => v as number);
    return { ...r, best: Math.min(...prices) } as Record<string, number | string> & { best: number };
  });
  let low: { date: string; price: number; retailer: string } | null = null;
  for (const p of points) if (!low || p.price < low.price) low = { date: p.date, price: p.price, retailer: p.retailer };
  return { rows, low };
}
