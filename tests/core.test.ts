import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { matchProduct, getProduct } from "@/lib/catalog";
import { bestDeals, couponDiscount } from "@/lib/deals";
import { toSeries, sinceFor } from "@/lib/history";
import { mockPriceProvider } from "@/lib/providers/mockPrices";
import { ruleAdvice } from "@/lib/ai";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-")); delete process.env.OPENAI_API_KEY; delete process.env.PAYPAL_CLIENT_ID; });
describe("catalog", () => {
  it("matches fuzzy names", () => { 
    expect(matchProduct("best price on sony xm5?")?.id).toBe("sony-wh1000xm5"); 
    expect(matchProduct("kindle")?.id).toBe("kindle-paperwhite"); 
    expect(matchProduct("zzz")).toBeNull(); 
  });
  it("rejects low-confidence matches without brand", () => {
    expect(matchProduct("iPhone Duo")).toBeNull();
    expect(matchProduct("duo")).toBeNull();
  });
  it("matches with brand even if generic word present", () => {
    expect(matchProduct("instant pot duo")?.id).toBe("instant-pot-duo");
  });
  it("still matches full phrase", () => {
    expect(matchProduct("Instant Pot Duo 7-in-1")?.id).toBe("instant-pot-duo");
  });
});
describe("deals", () => {
  const o = { retailer: "A", price: 200, shipping: 5, inStock: true, url: "", source: "mock" as const };
  it("applies min spend & verified", () => {
    expect(couponDiscount(o, { code: "TECH20OFF", retailer: "A", description: "", type: "fixed", value: 20, minSpend: 150, verified: true, source: "mock" })).toBe(20);
    expect(couponDiscount({ ...o, price: 100 }, { code: "TECH20OFF", retailer: "A", description: "", type: "fixed", value: 20, minSpend: 150, verified: true, source: "mock" })).toBe(0);
    expect(couponDiscount(o, { code: "X", retailer: "A", description: "", type: "percent", value: 10, verified: false, source: "mock" })).toBe(0);
  });
  it("sorts by effective price, in-stock first", () => {
    const d = bestDeals([o, { ...o, retailer: "B", price: 190 }, { ...o, retailer: "C", price: 100, inStock: false }],
      [{ code: "SAVE10", retailer: "A", description: "", type: "percent", value: 10, verified: true, source: "mock" }]);
    expect(d.map((x) => x.retailer)).toEqual(["A", "B", "C"]); expect(d[0].effectivePrice).toBe(185);
  });
});
describe("history", () => {
  it("seeds deterministic history and finds the low", () => {
    const p = getProduct("airpods-pro-2")!; const h = mockPriceProvider.getSeedHistory!(p, 30);
    expect(h.length).toBe(150); expect(mockPriceProvider.getSeedHistory!(p, 30)).toEqual(h);
    const { rows, low } = toSeries(h); expect(rows.length).toBe(30); expect(low!.price).toBe(Math.min(...h.map((x) => x.price)));
  });
  it("range math", () => { expect(sinceFor("All")).toBe("0000"); expect(sinceFor("1W", Date.UTC(2026, 0, 8))).toBe("2026-01-01"); });
});
describe("service + db", () => {
  it("persists snapshots and returns analysis", async () => {
    const { analyze } = await import("@/lib/service"); const { getHistory } = await import("@/lib/db");
    const a = await analyze(getProduct("dyson-v15")!); expect(a.deals.length).toBe(5);
    expect((await getHistory("dyson-v15")).length).toBeGreaterThan(3000);
    expect(ruleAdvice(getProduct("dyson-v15")!, a.deals, a.insight)).toMatch(/Best deal/);
  });
  it("simulated PayPal without creds", async () => {
    const { createOrder, captureOrder } = await import("@/lib/paypal");
    const o = await createOrder({ name: "x", retailer: "A", price: 10, shipping: 0, discount: 0, returnUrl: "http://l/r", cancelUrl: "http://l/c" });
    expect(o.via).toBe("simulated"); expect((await captureOrder(o.id)).status).toBe("COMPLETED");
  });
});
