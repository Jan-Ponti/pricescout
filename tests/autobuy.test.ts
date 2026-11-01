import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { decideAutoBuy } from "@/lib/autobuy";
import type { AutoBuyOpts } from "@/lib/types";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-ab-")); delete process.env.DATABASE_URL; for (const k of ["RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) delete process.env[k]; });
const ab = (o: Partial<AutoBuyOpts> = {}): AutoBuyOpts => ({ enabled: true, maxPrice: 100, monthlyCap: null, mode: "approval", ...o });
const deal = (price: number, inStock = true) => ({ effectivePrice: price, inStock });

describe("decideAutoBuy", () => {
  it("is off unless enabled with a max price", () => {
    expect(decideAutoBuy(undefined, deal(50), 0).buy).toBe(false);
    expect(decideAutoBuy(ab({ enabled: false }), deal(50), 0).buy).toBe(false);
    expect(decideAutoBuy(ab({ maxPrice: null }), deal(50), 0).buy).toBe(false);
  });
  it("buys at or below max price, in stock only", () => {
    expect(decideAutoBuy(ab(), deal(100), 0).buy).toBe(true);
    expect(decideAutoBuy(ab(), deal(100.01), 0).buy).toBe(false);
    expect(decideAutoBuy(ab(), deal(80, false), 0).reason).toMatch(/out of stock/);
  });
  it("never exceeds the monthly cap or an extra budget cap", () => {
    expect(decideAutoBuy(ab({ monthlyCap: 200 }), deal(90), 110).buy).toBe(true);
    expect(decideAutoBuy(ab({ monthlyCap: 200 }), deal(90), 111).reason).toMatch(/monthly cap/);
    expect(decideAutoBuy(ab(), deal(90), 50, 100).buy).toBe(false);
  });
});

describe("auto-buy in the price checker", () => {
  it("approval mode creates an order, logs a pending purchase, alerts with the approve link, and disarms", async () => {
    const { run, query, serializeWatchOpts } = await import("@/lib/db"); const { checkWatches } = await import("@/lib/alerts/checker");
    await run("INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)",
      ["kindle-paperwhite", null, 9999, new Date().toISOString(), serializeWatchOpts({ autoBuy: ab({ maxPrice: 10000, monthlyCap: 5000 }) })]);
    const [r] = await checkWatches("http://localhost:3000") as any[];
    expect(r.autoBuy.status).toBe("pending_approval"); expect(r.autoBuy.approve_url).toMatch(/token=SIM/);
    expect(r.channels["in-app"]).toBe("sent 1");
    const n = await query("SELECT title, url FROM notifications"); expect(n[0].title).toMatch(/Approve auto-buy/); expect(n[0].url).toMatch(/token=SIM/);
    const w = await query("SELECT opts FROM watches WHERE product_id = 'kindle-paperwhite'"); expect(JSON.parse(String(w[0].opts)).autoBuy.enabled).toBe(false);
    const [again] = await checkWatches() as any[]; expect(again.autoBuy).toBeUndefined();
    const { spentThisMonth, listPurchases } = await import("@/lib/purchases");
    expect((await listPurchases()).length).toBe(1); expect(await spentThisMonth()).toBeGreaterThan(0);
  });
  it("auto mode captures without a click in sandbox (simulated without keys)", async () => {
    const { run, serializeWatchOpts } = await import("@/lib/db"); const { checkWatches } = await import("@/lib/alerts/checker");
    await run("DELETE FROM watches"); await run("DELETE FROM purchases");
    await run("INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)",
      ["kindle-paperwhite", null, 9999, new Date().toISOString(), serializeWatchOpts({ autoBuy: ab({ maxPrice: 10000, mode: "auto" }) })]);
    const [r] = await checkWatches() as any[]; expect(r.autoBuy.status).toBe("completed"); expect(r.autoBuy.mode).toBe("auto");
  });
  it("respects the monthly cap", async () => {
    const { run, serializeWatchOpts } = await import("@/lib/db"); const { checkWatches } = await import("@/lib/alerts/checker");
    await run("DELETE FROM watches");
    await run("INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)",
      ["kindle-paperwhite", null, 9999, new Date().toISOString(), serializeWatchOpts({ autoBuy: ab({ maxPrice: 10000, monthlyCap: 1 }) })]);
    const [r] = await checkWatches() as any[]; expect(r.autoBuy).toBeUndefined();
  });
});
