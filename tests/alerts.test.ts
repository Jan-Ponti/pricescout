import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { evaluate, buildAlert } from "@/lib/alerts/rules";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-a-")); for (const k of ["RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_ID"]) delete process.env[k]; });
describe("alert rules", () => {
  it("fires on target crossing only once", () => {
    expect(evaluate(120, 99, 100).map((r) => r.kind)).toEqual(["target", "drop"]);
    expect(evaluate(99, 99, 100)).toEqual([]);
  });
  it("fires on drop vs last snapshot, ignores tiny/up moves", () => {
    expect(evaluate(100, 95, null)[0].kind).toBe("drop"); expect(evaluate(100, 99.9, null)).toEqual([]); expect(evaluate(100, 110, null)).toEqual([]); expect(evaluate(null, 50, null)).toEqual([]);
  });
  it("builds alert with price, drop, retailer, coupon and buy link", () => {
    const a = buildAlert("kindle-paperwhite", "Kindle", { retailer: "Target", price: 120, shipping: 0, inStock: true, url: "", source: "mock", discount: 12, effectivePrice: 108, coupon: { code: "SAVE10", retailer: "Target", description: "", type: "percent", value: 10, verified: true, source: "mock" } }, 130, evaluate(130, 108, null), "https://x.app/");
    expect(a.drop).toBe(22); expect(a.body).toMatch(/Target: \$108\.00 \(↓ \$22\.00\) with code SAVE10/);
    expect(a.url).toBe("https://x.app/?buy=kindle-paperwhite&retailer=Target");
  });
});
describe("checker + channels", () => {
  it("simulated drop triggers in-app alert; optional channels disabled", async () => {
    const { run, query } = await import("@/lib/db"); const { checkWatches } = await import("@/lib/alerts/checker");
    await run("INSERT OR REPLACE INTO watches VALUES (?,?,?,?)", ["kindle-paperwhite", null, 9999, new Date().toISOString()]);
    const [r] = await checkWatches("http://localhost:3000") as any[];
    expect(r.alerted).toBe(true); expect(r.channels["in-app"]).toBe("sent 1"); expect(r.channels["web-push"]).toBe("sent 0");
    expect(r.channels.email).toMatch(/disabled/); expect(r.channels.sms).toMatch(/disabled/);
    expect((await query("SELECT * FROM notifications")).length).toBe(1);
    const [again] = await checkWatches() as any[]; expect(again.alerted).toBe(false);
    await run("INSERT OR REPLACE INTO sim_drops VALUES (?, 0.8)", ["kindle-paperwhite"]);
    const [dropped] = await checkWatches() as any[]; expect(dropped.alerted).toBe(true); expect(dropped.alert.drop).toBeGreaterThan(0);
  });
  it("generates and persists VAPID keys when env is unset", async () => {
    const { vapidKeys } = await import("@/lib/alerts/channels"); const a = await vapidKeys(); expect(a.publicKey.length).toBeGreaterThan(60); expect(await vapidKeys()).toEqual(a);
  });
});
