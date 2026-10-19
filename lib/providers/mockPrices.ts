import type { PriceProvider, Product, Offer, PricePoint } from "../types";
import { seeded, round2 } from "../rand";
/** MOCK provider: simulated retailers with deterministic, realistic price curves (sales events, drift). */
export const RETAILERS = [
  { name: "Amazon", bias: 0.9, ship: 0 }, { name: "Best Buy", bias: 0.95, ship: 0 },
  { name: "Walmart", bias: 0.92, ship: 0 }, { name: "Target", bias: 0.97, ship: 0 }, { name: "eBay", bias: 0.86, ship: 6.99 },
];
const DAY = 86400000;
export function priceOn(p: Product, retailer: string, bias: number, t: number): number {
  const day = Math.floor(t / DAY);
  const r = seeded(`${p.id}:${retailer}:${day}`)();
  const d = new Date(t); const m = d.getUTCMonth(), dd = d.getUTCDate();
  let f = bias + 0.04 * Math.sin(day / 23 + retailer.length) + (r - 0.5) * 0.02;
  if (m === 10 && dd >= 20) f -= 0.15;               // Black Friday window
  if (m === 6 && dd >= 8 && dd <= 12) f -= 0.12;      // July "Prime Day"-style sale
  if (seeded(`${p.id}:${retailer}:flash:${Math.floor(day / 9)}`)() > 0.9) f -= 0.08; // random flash sales
  return round2(Math.max(p.msrp * 0.55, p.msrp * Math.min(f, 1.02)));
}
export const mockPriceProvider: PriceProvider = {
  name: "Mock retailers (simulated)",
  async getOffers(p: Product): Promise<Offer[]> {
    const now = Date.now();
    return RETAILERS.map((r) => ({
      retailer: r.name, price: priceOn(p, r.name, r.bias, now), shipping: r.ship,
      inStock: seeded(`${p.id}:${r.name}:stock`)() > 0.1,
      url: `https://example.com/mock/${encodeURIComponent(r.name)}/${p.id}`, source: "mock",
    }));
  },
  getSeedHistory(p: Product, days: number): PricePoint[] {
    const out: PricePoint[] = []; const now = Date.now();
    for (let i = days; i >= 1; i--) {
      const t = now - i * DAY; const date = new Date(t).toISOString().slice(0, 10);
      for (const r of RETAILERS) out.push({ date, retailer: r.name, price: priceOn(p, r.name, r.bias, t) });
    }
    return out;
  },
};
