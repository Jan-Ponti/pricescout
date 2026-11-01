import { describe, it, expect } from "vitest";
import { payLaterOptions } from "@/lib/paylater";
import { ruleAdvice } from "@/lib/ai";
import { CATALOG } from "@/lib/catalog";
describe("Pay Later estimates", () => {
  it("Pay in 4 = price/4 within $30–$1,500", () => {
    expect(payLaterOptions(69.6).payIn4).toEqual({ installment: 17.4, total: 69.6 });
    expect(payLaterOptions(100.01).payIn4?.installment).toBe(25);
    expect(payLaterOptions(29.99).payIn4).toBeNull(); expect(payLaterOptions(1500.01).payIn4).toBeNull();
  });
  it("monthly from $199, labeled as an estimate", () => {
    expect(payLaterOptions(150).monthly).toBeNull();
    expect(payLaterOptions(240).monthly).toEqual({ months: 12, perMonth: 20 });
    expect(payLaterOptions(240).label).toMatch(/Pay in 4|4 interest-free/); expect(payLaterOptions(240).label).toMatch(/estimate/);
    expect(payLaterOptions(10).label).toBe("");
  });
  it("rule-based chat answer mentions Pay Later (no OpenAI key needed)", () => {
    const p = CATALOG[0];
    const d: any = { retailer: "Amazon", price: 300, shipping: 0, inStock: true, url: "", source: "mock", discount: 0, effectivePrice: 300, tax: 0, membershipSave: 0, totalCost: 300, score: 80, scoreReasons: [] };
    expect(ruleAdvice(p, [d], { lowest: null, avg90: 310, current: 300 })).toMatch(/PayPal Pay Later: 4 interest-free payments of ~\$75\.00/);
  });
});
