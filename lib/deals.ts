import type { Offer, Coupon, Deal, ShopperPrefs, Insight } from "./types";
import { round2 } from "./rand";
import { taxRateForZip } from "./prefs";

export function couponDiscount(o: Offer, c: Coupon): number {
  if (!c.verified || c.retailer !== o.retailer) return 0;
  const base = o.price;
  if (c.minSpend && base < c.minSpend) return 0;
  if (c.code === "FREESHIP") return o.shipping;
  let d = c.type === "percent" ? (base * c.value) / 100 : c.value;
  if (c.code === "NEWBUYER15") d = Math.min(d, 40);
  return round2(Math.min(d, base));
}

function membershipSave(o: Offer, discount: number, prefs: ShopperPrefs): number {
  const mems = prefs.memberships ?? [];
  let save = 0;
  const afterCoupon = o.price + o.shipping - discount;
  if (mems.includes("prime") && o.retailer === "Amazon") {
    save += o.shipping; // waive any ship
    save += round2(afterCoupon * 0.02); // approx Prime rewards
  }
  if (mems.includes("walmart+") && o.retailer === "Walmart") {
    save += o.shipping;
    save += round2(afterCoupon * 0.02);
  }
  if (mems.includes("plus") && o.retailer === "Target") {
    save += o.shipping;
    save += round2(Math.min(5, afterCoupon * 0.05));
  }
  return round2(Math.min(save, afterCoupon));
}

function passesCondition(o: Offer, prefs: ShopperPrefs): boolean {
  const c = o.condition ?? "new";
  if (c === "open_box" && !prefs.allowOpenBox) return false;
  if (c === "refurbished" && !prefs.allowRefurbished) return false;
  return true;
}

function meetsDeadline(o: Offer, prefs: ShopperPrefs): boolean {
  if (!prefs.needBy || o.etaDays == null) return true;
  const need = Date.parse(prefs.needBy);
  if (Number.isNaN(need)) return true;
  const arrive = Date.now() + o.etaDays * 86400000;
  return arrive <= need + 86400000; // allow same-day buffer
}

/** Apply coupons, estimate tax + membership perks, score, and rank by total cost. */
export function bestDeals(offers: Offer[], coupons: Coupon[], prefs: ShopperPrefs = {}, insight?: Pick<Insight, "lowest" | "avg90">): Deal[] {
  const rate = taxRateForZip(prefs.zip);
  const scored = offers.map((o) => {
    let coupon: Coupon | undefined; let discount = 0;
    for (const c of coupons) { const d = couponDiscount(o, c); if (d > discount) { discount = d; coupon = c; } }
    const effectivePrice = round2(o.price + o.shipping - discount);
    const memSave = membershipSave(o, discount, prefs);
    const tax = round2(Math.max(0, o.price - discount) * rate);
    const totalCost = round2(effectivePrice - memSave + tax);
    const condOk = passesCondition(o, prefs);
    const { score, scoreReasons } = scoreDeal({ ...o, coupon, discount, effectivePrice, tax, membershipSave: memSave, totalCost, score: 0, scoreReasons: [] }, insight, prefs);
    return { ...o, coupon, discount, effectivePrice, tax, membershipSave: memSave, totalCost, score: condOk ? score : Math.max(0, score - 25), scoreReasons: condOk ? scoreReasons : [...scoreReasons, "Condition outside your prefs"] };
  });
  return scored.sort((a, b) => {
    const aCond = Number(passesCondition(a, prefs));
    const bCond = Number(passesCondition(b, prefs));
    if (bCond !== aCond) return bCond - aCond;
    const aOk = Number(a.inStock && meetsDeadline(a, prefs));
    const bOk = Number(b.inStock && meetsDeadline(b, prefs));
    if (bOk !== aOk) return bOk - aOk;
    if (prefs.budget != null) {
      const aIn = Number(a.totalCost <= prefs.budget);
      const bIn = Number(b.totalCost <= prefs.budget);
      if (bIn !== aIn) return bIn - aIn;
    }
    return a.totalCost - b.totalCost || b.score - a.score;
  });
}

export function scoreDeal(d: Deal, insight?: Pick<Insight, "lowest" | "avg90">, prefs: ShopperPrefs = {}): { score: number; scoreReasons: string[] } {
  let score = 50; const reasons: string[] = [];
  if (!d.inStock) { score -= 35; reasons.push("Out of stock"); }
  else reasons.push("In stock");
  if (d.coupon) { score += 8; reasons.push(`Coupon ${d.coupon.code}`); }
  if (d.shipping === 0 || d.membershipSave > 0) { score += 5; reasons.push(d.membershipSave > 0 ? "Membership perk" : "Free shipping"); }
  else { score -= 3; reasons.push(`+$${d.shipping.toFixed(2)} shipping`); }
  if ((d.condition ?? "new") !== "new") { score -= 4; reasons.push(d.condition === "open_box" ? "Open-box" : "Refurbished"); }
  if (d.sellerRating != null) {
    if (d.sellerRating >= 4.5) { score += 4; reasons.push(`Seller ${d.sellerRating.toFixed(1)}★`); }
    else if (d.sellerRating < 4) { score -= 6; reasons.push(`Seller ${d.sellerRating.toFixed(1)}★`); }
  }
  if (insight?.avg90) {
    const vs = ((d.effectivePrice - insight.avg90) / insight.avg90) * 100;
    if (vs <= -8) { score += 18; reasons.push(`${Math.abs(vs).toFixed(0)}% below 90-day avg`); }
    else if (vs <= -3) { score += 10; reasons.push(`${Math.abs(vs).toFixed(0)}% below 90-day avg`); }
    else if (vs >= 8) { score -= 12; reasons.push(`${vs.toFixed(0)}% above 90-day avg`); }
    else if (vs >= 3) { score -= 6; reasons.push(`${vs.toFixed(0)}% above 90-day avg`); }
    else reasons.push("Near 90-day average");
  }
  if (insight?.lowest) {
    const vsLow = ((d.effectivePrice - insight.lowest.price) / insight.lowest.price) * 100;
    if (vsLow <= 3) { score += 15; reasons.push("At/near all-time low"); }
    else if (vsLow <= 8) { score += 8; reasons.push(`Within ${vsLow.toFixed(0)}% of all-time low`); }
    else reasons.push(`${vsLow.toFixed(0)}% above all-time low`);
  }
  if (prefs.budget != null) {
    if (d.totalCost <= prefs.budget) { score += 5; reasons.push(`Within $${prefs.budget} budget`); }
    else { score -= 15; reasons.push(`Over $${prefs.budget} budget`); }
  }
  if (prefs.needBy && d.etaDays != null) {
    if (meetsDeadline(d, prefs)) { score += 4; reasons.push(`Arrives in ~${d.etaDays}d`); }
    else { score -= 20; reasons.push(`ETA ${d.etaDays}d misses deadline`); }
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), scoreReasons: reasons.slice(0, 5) };
}
