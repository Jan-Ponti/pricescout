import type { Deal, Insight, Prediction, Product } from "./types";
import { round2 } from "./rand";

/** Upcoming seasonal sale windows used for buy/wait advice (demo calendar). */
export function nextSaleWindow(now = new Date()): Prediction["nextSale"] {
  const y = now.getUTCFullYear(); const m = now.getUTCMonth(); const d = now.getUTCDate();
  const candidates: NonNullable<Prediction["nextSale"]>[] = [
    { label: "July sale (Prime Day–style)", approxDate: `${y}-07-10`, expectedDropPct: 12 },
    { label: "Black Friday window", approxDate: `${y}-11-25`, expectedDropPct: 15 },
    { label: "July sale (Prime Day–style)", approxDate: `${y + 1}-07-10`, expectedDropPct: 12 },
    { label: "Black Friday window", approxDate: `${y + 1}-11-25`, expectedDropPct: 15 },
  ];
  const today = Date.UTC(y, m, d);
  // If we're already inside Black Friday window, treat as "now"
  if (m === 10 && d >= 20) return { label: "Black Friday window (now)", approxDate: new Date(today).toISOString().slice(0, 10), expectedDropPct: 15 };
  if (m === 6 && d >= 8 && d <= 12) return { label: "July sale (now)", approxDate: new Date(today).toISOString().slice(0, 10), expectedDropPct: 12 };
  return candidates.find((c) => Date.parse(c.approxDate + "T00:00:00Z") >= today) ?? candidates[candidates.length - 1];
}

export function predictBuyWait(deals: Deal[], insight: Pick<Insight, "lowest" | "avg90" | "current">, product?: Product, now = new Date()): Prediction {
  const best = deals[0];
  const current = best?.effectivePrice ?? insight.current;
  const vsAvgPct = insight.avg90 ? round2(((current - insight.avg90) / insight.avg90) * 100) : 0;
  const vsLowPct = insight.lowest ? round2(((current - insight.lowest.price) / insight.lowest.price) * 100) : null;
  const nextSale = nextSaleWindow(now);
  const reasons: string[] = [];
  let verdict: Prediction["verdict"] = "watch";
  let confidence = 55;

  if (vsLowPct != null && vsLowPct <= 3) {
    verdict = "buy"; confidence = 90; reasons.push("At or within 3% of the all-time low");
  } else if (vsAvgPct <= -8) {
    verdict = "buy"; confidence = 82; reasons.push(`${Math.abs(vsAvgPct)}% below the 90-day average`);
  } else if (vsAvgPct <= -3) {
    verdict = "buy"; confidence = 70; reasons.push(`${Math.abs(vsAvgPct)}% below the 90-day average`);
  } else if (vsAvgPct >= 8 && nextSale && !nextSale.label.includes("(now)")) {
    verdict = "wait"; confidence = 75;
    reasons.push(`${vsAvgPct}% above the 90-day average`);
    reasons.push(`${nextSale.label} often drops ~${nextSale.expectedDropPct}% (around ${nextSale.approxDate})`);
  } else if (vsAvgPct >= 3) {
    verdict = "wait"; confidence = 62; reasons.push(`${vsAvgPct}% above the 90-day average — waiting could pay off`);
  } else {
    verdict = "watch"; confidence = 58; reasons.push("Near the 90-day average — set a target or wait for a flash sale");
  }

  if (best && !best.inStock && verdict === "buy") {
    verdict = "watch"; confidence = Math.min(confidence, 50); reasons.push("Best-priced retailer is out of stock");
  }
  if (best?.score != null && best.score >= 80 && verdict !== "wait") {
    confidence = Math.min(95, confidence + 5); reasons.push(`Deal score ${best.score}/100`);
  }
  if (product?.category === "Gaming" && nextSale && verdict === "wait") {
    reasons.push("Consoles often see clearer drops around big sale events");
  }

  // If the seasonal sale is "now" and price is already discounted vs avg, lean buy
  if (nextSale?.label.includes("(now)") && vsAvgPct <= -3) {
    verdict = "buy"; confidence = Math.max(confidence, 85); reasons.push("Seasonal sale window is active");
  }

  return { verdict, confidence, reasons: reasons.slice(0, 4), nextSale, vsAvgPct, vsLowPct };
}

export function predictionBlurb(p: Prediction): string {
  const v = p.verdict === "buy" ? "**Buy now**" : p.verdict === "wait" ? "**Wait**" : "**Watch**";
  const sale = p.nextSale && p.verdict === "wait" && !p.nextSale.label.includes("(now)")
    ? ` Next likely dip: ${p.nextSale.label} (~${p.nextSale.approxDate}, ~${p.nextSale.expectedDropPct}% off).`
    : "";
  return `${v} (${p.confidence}% confidence). ${p.reasons[0] ?? ""}.${sale}`;
}
