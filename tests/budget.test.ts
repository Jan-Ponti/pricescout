import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { budgetStatus, applyBudget } from "@/lib/budget";
import { parseConstraints } from "@/lib/prefs";
import { serializeWatchOpts } from "@/lib/db";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-bd-")); delete process.env.DATABASE_URL; for (const k of ["RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) delete process.env[k]; });
const pred = { verdict: "buy" as const, confidence: 85, reasons: ["At the low"], nextSale: null, vsAvgPct: -10, vsLowPct: 0 };
describe("monthly budget", () => {
  it("computes remaining and flips BUY to WAIT when over budget", () => {
    const b = budgetStatus(400, 500); expect(b).toMatchObject({ remaining: 100, pct: 80 });
    expect(applyBudget(pred, 120, b).verdict).toBe("wait"); expect(applyBudget(pred, 120, b).reasons[0]).toMatch(/monthly budget/);
    expect(applyBudget(pred, 90, b).verdict).toBe("buy");
    expect(applyBudget(pred, 9999, budgetStatus(0, null)).verdict).toBe("buy");
  });
  it("parses monthly budgets from chat without clobbering the per-item budget", () => {
    expect(parseConstraints("set my monthly budget to $500")).toEqual({ monthlyBudget: 500 });
    expect(parseConstraints("I can spend $300 a month")).toMatchObject({ monthlyBudget: 300 });
    expect(parseConstraints("headphones under $300").budget).toBe(300);
  });
  it("verdict and auto-buy respect it end-to-end", async () => {
    const { setPrefs } = await import("@/lib/prefs"); const { addPurchase } = await import("@/lib/purchases"); const { analyze } = await import("@/lib/service");
    const { getProduct } = await import("@/lib/catalog"); const { run } = await import("@/lib/db"); const { checkWatches } = await import("@/lib/alerts/checker");
    await setPrefs({ monthlyBudget: 200 });
    await addPurchase({ order_id: "X1", product_id: "instant-pot-duo", product_name: "Instant Pot", retailer: "Amazon", amount: 150, status: "completed", mode: "test-card", source: "chat", approve_url: null, note: null });
    const a = await analyze(getProduct("kindle-paperwhite")!);
    expect(a.insight.budget?.remaining).toBe(50); expect(a.insight.prediction.verdict).toBe("wait");
    await run("INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)",
      ["kindle-paperwhite", null, 9999, new Date().toISOString(), serializeWatchOpts({ autoBuy: { enabled: true, maxPrice: 10000, monthlyCap: null, mode: "auto" } })]);
    const [r] = await checkWatches() as any[]; expect(r.autoBuy).toBeUndefined();
  });
});
