import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { bestDeals, couponDiscount } from "@/lib/deals";
import { parseConstraints, taxRateForZip } from "@/lib/prefs";
import { evaluate, buildAlert } from "@/lib/alerts/rules";
import { predictBuyWait, nextSaleWindow } from "@/lib/predict";
import { getProduct } from "@/lib/catalog";
import type { Deal } from "@/lib/types";

beforeAll(() => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-e-"));
  delete process.env.OPENAI_API_KEY;
});

describe("total cost + scoring", () => {
  const offers = [
    { retailer: "Amazon", price: 200, shipping: 0, inStock: true, url: "", source: "mock" as const, condition: "new" as const, etaDays: 2, sellerRating: 4.8, membership: "prime" as const },
    { retailer: "eBay", price: 170, shipping: 6.99, inStock: true, url: "", source: "mock" as const, condition: "open_box" as const, etaDays: 7, sellerRating: 4.2, membership: "none" as const },
    { retailer: "Target", price: 210, shipping: 5, inStock: true, url: "", source: "mock" as const, condition: "new" as const, etaDays: 4, sellerRating: 4.6, membership: "plus" as const },
  ];
  const coupons = [{ code: "SAVE10", retailer: "Amazon", description: "", type: "percent" as const, value: 10, verified: true, source: "mock" as const }];

  it("ranks preferred conditions first and estimates tax", () => {
    const d = bestDeals(offers, coupons, { zip: "48201" }, { avg90: 220, lowest: { date: "2025-01-01", price: 160, retailer: "eBay" } });
    expect(d[0].condition).toBe("new");
    expect(d.find((x) => x.condition === "open_box")?.scoreReasons.join(" ")).toMatch(/Condition outside/);
    expect(d[0].tax).toBeGreaterThan(0);
    expect(d[0].totalCost).toBeGreaterThan(d[0].effectivePrice - 0.01);
    expect(d[0].score).toBeGreaterThan(0);
  });

  it("applies membership perks when preferred", () => {
    const d = bestDeals(offers, coupons, { zip: "48201", memberships: ["prime"], allowOpenBox: true, budget: 250 }, { avg90: 220, lowest: null });
    expect(d.some((x) => x.retailer === "eBay")).toBe(true);
    const amz = d.find((x) => x.retailer === "Amazon")!;
    expect(amz.membershipSave).toBeGreaterThan(0);
  });

  it("still applies coupon rules", () => {
    expect(couponDiscount(offers[0], coupons[0])).toBe(20);
  });
});

describe("constraints + tax", () => {
  it("parses budget, zip, deadline, memberships, condition", () => {
    const c = parseConstraints("Sony XM5 under $300 ZIP 48201, I have Prime, open-box OK, need by Friday");
    expect(c.budget).toBe(300);
    expect(c.zip).toBe("48201");
    expect(c.memberships).toContain("prime");
    expect(c.allowOpenBox).toBe(true);
    expect(c.needBy).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("maps Detroit ZIP to MI rate", () => {
    expect(taxRateForZip("48201")).toBe(0.06);
    expect(taxRateForZip("90210")).toBe(0.095);
  });
});

describe("richer alerts", () => {
  const deal = (over: Partial<Deal> = {}): Deal => ({
    retailer: "Target", price: 120, shipping: 0, inStock: true, url: "", source: "mock",
    discount: 12, effectivePrice: 108, tax: 6, membershipSave: 0, totalCost: 114, score: 70, scoreReasons: [],
    coupon: { code: "SAVE10", retailer: "Target", description: "", type: "percent", value: 10, verified: true, source: "mock" },
    ...over,
  });
  it("keeps target/drop behavior", () => {
    expect(evaluate(120, 99, 100).map((r) => r.kind)).toEqual(["target", "drop"]);
  });
  it("fires ATL, near-low, stock, coupon reasons", () => {
    const kinds = evaluate(130, 100, {
      lowest: 100, alertAtl: true, nearLowPct: 5,
      alertStock: true, wasInStock: false, nowInStock: true,
      alertCoupon: true, hadCoupon: false, hasCoupon: true,
    }).map((r) => r.kind);
    expect(kinds).toEqual(expect.arrayContaining(["atl", "near_low", "stock", "coupon"]));
  });
  it("titles stock alerts differently", () => {
    const a = buildAlert("x", "X", deal(), 130, [{ kind: "stock", message: "Back in stock" }], "https://x.app/");
    expect(a.title).toMatch(/Back in stock/);
  });
});

describe("buy/wait prediction", () => {
  it("returns a seasonal window", () => {
    const s = nextSaleWindow(new Date("2026-03-01T00:00:00Z"));
    expect(s?.label).toMatch(/July|Black Friday/);
  });
  it("recommends buy near all-time low", () => {
    const deals = [{ retailer: "A", price: 100, shipping: 0, inStock: true, url: "", source: "mock" as const, discount: 0, effectivePrice: 100, tax: 0, membershipSave: 0, totalCost: 100, score: 88, scoreReasons: [] }];
    const p = predictBuyWait(deals, { avg90: 130, current: 100, lowest: { date: "2026-01-01", price: 99, retailer: "A" } }, getProduct("kindle-paperwhite")!);
    expect(p.verdict).toBe("buy");
    expect(p.confidence).toBeGreaterThan(80);
  });
});

describe("service + watchlist integration", () => {
  it("analyze returns scored deals, tax, and prediction", async () => {
    const { setPrefs } = await import("@/lib/prefs");
    await setPrefs({ zip: "48201", memberships: ["prime"] });
    const { analyze } = await import("@/lib/service");
    const a = await analyze(getProduct("sony-wh1000xm5")!);
    expect(a.deals[0].score).toBeGreaterThan(0);
    expect(a.deals[0].tax).toBeGreaterThan(0);
    expect(a.insight.prediction?.verdict).toMatch(/buy|wait|watch/);
    expect(a.deals[0].totalCost).toBeGreaterThan(0);
  });
  it("watch opts persist and watchlist enriches", async () => {
    const { run, query, parseWatchOpts } = await import("@/lib/db");
    const { analyze } = await import("@/lib/service");
    const a = await analyze(getProduct("kindle-paperwhite")!);
    await run("INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)",
      ["kindle-paperwhite", 100, a.deals[0].effectivePrice, new Date().toISOString(), JSON.stringify({ alertAtl: true, nearLowPct: 5, alertStock: true })]);
    const w = (await query("SELECT * FROM watches WHERE product_id = ?", ["kindle-paperwhite"]))[0];
    expect(parseWatchOpts(w.opts).alertAtl).toBe(true);
  });
});
