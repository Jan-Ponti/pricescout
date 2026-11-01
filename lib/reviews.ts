import { query, run } from "./db";
import { aiJson } from "./ai";
import { mockReviews, type Review } from "./providers/mockReviews";
import type { Product } from "./types";

export interface ReviewSummary { productId: string; avgRating: number; count: number; pros: string[]; cons: string[]; complaints: string[]; via: "llm" | "rules"; source: "mock"; generated: string }
/** Theme keywords for the no-AI fallback. */
const THEMES: Array<[RegExp, string]> = [
  [/noise cancel/i, "noise canceling"], [/battery/i, "battery life"], [/comfort/i, "comfort"], [/sound/i, "sound quality"], [/screen/i, "screen"],
  [/suction/i, "suction"], [/easy to (use|clean)/i, "ease of use"], [/value|price/i, "value"], [/detail/i, "detail"], [/fun build/i, "fun build"],
  [/scroll|click/i, "scroll wheel & clicks"], [/case/i, "case"], [/touch control/i, "touch controls"], [/fit/i, "fit"], [/drift/i, "Joy-Con drift"],
  [/bin/i, "small bin"], [/missing/i, "missing pieces"], [/ads/i, "lockscreen ads"], [/expensive/i, "price"], [/storage/i, "storage"], [/android/i, "Android support"],
  [/fragile/i, "fragility"], [/manual|learning curve/i, "learning curve"], [/sealing ring|smell/i, "sealing ring odor"], [/slow/i, "speed"], [/small hands|too big/i, "size"], [/software/i, "software"],
];
const themesOf = (rs: Review[]) => { const m = new Map<string, number>(); for (const r of rs) for (const [re, t] of THEMES) if (re.test(r.text)) m.set(t, (m.get(t) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t); };
/** Pure rule-based summary: themes from 4–5★ reviews are pros, themes from ≤3★ are cons; themes repeated in ≥2 low reviews are common complaints. */
export function ruleSummary(p: Product, rs: Review[]): Omit<ReviewSummary, "generated"> {
  const hi = rs.filter((r) => r.rating >= 4), lo = rs.filter((r) => r.rating <= 3);
  const loCount = new Map<string, number>(); for (const r of lo) for (const [re, t] of THEMES) if (re.test(r.text)) loCount.set(t, (loCount.get(t) ?? 0) + 1);
  const pros = themesOf(hi).filter((t) => !["price", "small bin", "missing pieces", "lockscreen ads", "Joy-Con drift", "fragility"].includes(t)).slice(0, 3);
  const cons = themesOf(lo).filter((t) => !pros.includes(t)).slice(0, 3);
  const complaints = [...loCount.entries()].filter(([, n]) => n >= 2).map(([t]) => t).slice(0, 3);
  const avg = Math.round((rs.reduce((s, r) => s + r.rating, 0) / Math.max(1, rs.length)) * 10) / 10;
  return { productId: p.id, avgRating: avg, count: rs.length, pros, cons, complaints, via: "rules", source: "mock" };
}
const key = (id: string) => `reviews:${id}`;
/** Cached per product (kv table). Uses gpt-4o-mini when a key is set; rule summary otherwise. */
export async function getReviewSummary(p: Product, { refresh = false } = {}): Promise<ReviewSummary> {
  if (!refresh) { const row = (await query("SELECT v FROM kv WHERE k = ?", [key(p.id)]))[0]; if (row) return JSON.parse(String(row.v)); }
  const rs = mockReviews(p); const fb = ruleSummary(p, rs);
  const { data, via } = await aiJson<{ pros?: string[]; cons?: string[]; complaints?: string[] }>(
    'Summarize these product reviews. Reply JSON {"pros": string[], "cons": string[], "complaints": string[]} with at most 3 short phrases each (≤6 words). "complaints" = issues mentioned by multiple reviewers. Only use what the reviews say.',
    JSON.stringify({ product: p.name, reviews: rs.map(({ rating, text }) => ({ rating, text })) }), fb);
  const clean = (a: unknown, d: string[]) => (Array.isArray(a) ? a.filter((x) => typeof x === "string").slice(0, 3) : d);
  const out: ReviewSummary = { ...fb, pros: clean(data.pros, fb.pros), cons: clean(data.cons, fb.cons), complaints: clean(data.complaints, fb.complaints), via, generated: new Date().toISOString() };
  await run("INSERT OR REPLACE INTO kv VALUES (?, ?)", [key(p.id), JSON.stringify(out)]);
  return out;
}
