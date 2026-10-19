import { priceProviders, couponProviders } from "./providers";
import { saveSnapshots, hasHistory, getHistory, getSimFactor } from "./db";
import { bestDeals } from "./deals";
import { toSeries } from "./history";
import type { Product, Offer, Coupon } from "./types";
import { round2 } from "./rand";

export async function analyze(p: Product) {
  if (!(await hasHistory(p.id))) for (const pr of priceProviders) if (pr.getSeedHistory) await saveSnapshots(p.id, pr.getSeedHistory(p, 730));
  const sim = await getSimFactor(p.id); // demo-only "simulate price drop" multiplier (1 = none)
  const offers: Offer[] = (await Promise.all(priceProviders.map((pr) => pr.getOffers(p).catch(() => [])))).flat()
    .map((o) => (sim === 1 ? o : { ...o, price: round2(o.price * sim) }));
  const today = new Date().toISOString().slice(0, 10);
  await saveSnapshots(p.id, offers.map((o) => ({ date: today, retailer: o.retailer, price: o.price })));
  const coupons: Coupon[] = (await Promise.all(couponProviders.map((c) => c.getCoupons(p, offers.map((o) => o.retailer)).catch(() => [])))).flat();
  const deals = bestDeals(offers, coupons);
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { rows, low } = toSeries(await getHistory(p.id));
  const r90 = rows.filter((r) => (r.date as string) >= since90);
  const avg90 = round2(r90.reduce((s, r) => s + (r.best as number), 0) / Math.max(1, r90.length));
  return { deals, coupons, insight: { lowest: low, avg90, current: deals[0]?.effectivePrice ?? 0 },
    sources: { prices: priceProviders.map((x) => x.name), coupons: couponProviders.map((x) => x.name) } };
}
