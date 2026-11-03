import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { evaluateProtection, ruleDraft, windowDays } from "@/lib/protection";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-pp-")); delete process.env.DATABASE_URL; for (const k of ["RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) delete process.env[k]; });
const now = new Date("2026-11-10T12:00:00Z");
describe("evaluateProtection", () => {
  it("is eligible for a $1+ drop inside the window on completed purchases", () => {
    const p = { amount: 100, created: "2026-11-01T12:00:00Z", status: "completed" as const };
    expect(evaluateProtection(p, 90, 14, now)).toMatchObject({ eligible: true, drop: 10, daysLeft: 5, deadline: "2026-11-15" });
    expect(evaluateProtection(p, 99.5, 14, now).eligible).toBe(false);
    expect(evaluateProtection(p, 90, 7, now).eligible).toBe(false);
    expect(evaluateProtection({ ...p, status: "pending_approval" }, 50, 14, now).eligible).toBe(false);
  });
  it("defaults the window to 14 days", () => { expect(windowDays(undefined)).toBe(14); expect(windowDays(30)).toBe(30); expect(windowDays(-1)).toBe(14); });
  it("rule draft includes the facts and is never auto-sent", () => {
    const t = ruleDraft({ purchaseId: "x", productId: "k", productName: "Kindle", retailer: "Amazon", paid: 100, nowPrice: 90, drop: 10, purchasedOn: "2026-11-01", deadline: "2026-11-15", daysLeft: 5, orderId: "ABC123" });
    expect(t).toMatch(/Subject:/); expect(t).toMatch(/\$10\.00/); expect(t).toMatch(/ABC123/);
  });
});
describe("checkProtection", () => {
  it("alerts once per new drop and stores a copyable draft (no AI key)", async () => {
    const { run } = await import("@/lib/db"); const { addPurchase } = await import("@/lib/purchases");
    const { checkProtection, listClaims } = await import("@/lib/protection"); const { getProduct } = await import("@/lib/catalog"); const { analyze } = await import("@/lib/service");
    const { deals } = await analyze(getProduct("kindle-paperwhite")!); const d = deals[0];
    await addPurchase({ order_id: "ORDER12345", product_id: "kindle-paperwhite", product_name: "Kindle", retailer: d.retailer, amount: d.effectivePrice, status: "completed", mode: "test-card", source: "chat", approve_url: null, note: null });
    expect((await checkProtection()).every((r) => !r.eligible)).toBe(true);
    await run("INSERT OR REPLACE INTO sim_drops (visitor, product_id, factor) VALUES ('default', ?,?)", ["kindle-paperwhite", 0.8]);
    const [r] = await checkProtection(); expect(r.eligible).toBe(true); expect(r.channels?.["in-app"]).toBe("sent 1");
    const [c] = await listClaims(); expect(c.via).toBe("rules"); expect(c.draft).toMatch(/price adjustment/i);
    const [again] = await checkProtection(); expect(again.channels).toBeUndefined();
  });
});
