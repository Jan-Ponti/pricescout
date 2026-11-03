import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { withVisitor, currentVisitor, vk, validVisitorId } from "@/lib/visitor";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-vis-")); delete process.env.DATABASE_URL; for (const k of ["RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY", "OPENAI_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"]) delete process.env[k]; });
const A = "visitorAAAA1"; const B = "visitorBBBB2";

describe("visitor context", () => {
  it("defaults outside a request and scopes with withVisitor", async () => {
    expect(currentVisitor()).toBe("default");
    expect(await withVisitor(A, async () => currentVisitor())).toBe(A);
    expect(vk("shopper_prefs")).toBe("shopper_prefs");
    expect(withVisitor(A, () => vk("shopper_prefs"))).toBe(`v:${A}:shopper_prefs`);
    expect(validVisitorId("../../etc")).toBe(false); expect(validVisitorId(A)).toBe(true);
  });
});

describe("per-visitor data", () => {
  it("keeps watches, prefs, purchases and notifications separate", async () => {
    const { run, query } = await import("@/lib/db"); const { setPrefs, getPrefs } = await import("@/lib/prefs");
    const { addPurchase, listPurchases } = await import("@/lib/purchases");
    await withVisitor(A, async () => {
      await run("INSERT INTO watches (visitor, product_id, target) VALUES (?, 'kindle-paperwhite', 1)", [currentVisitor()]);
      await setPrefs({ zip: "48201" });
      await addPurchase({ order_id: "X", product_id: "kindle-paperwhite", product_name: "Kindle", retailer: "Amazon", amount: 10, status: "completed", mode: "approval", source: "t", approve_url: null, note: null });
    });
    await withVisitor(B, async () => {
      expect((await getPrefs()).zip).toBe("");
      expect(await listPurchases()).toEqual([]);
      expect(await query("SELECT * FROM watches WHERE visitor = ?", [currentVisitor()])).toEqual([]);
    });
    expect((await withVisitor(A, () => getPrefs())).zip).toBe("48201");
    expect((await withVisitor(A, () => listPurchases())).length).toBe(1);
  });
  it("cron checks every visitor with that visitor's own caps", async () => {
    const { run, serializeWatchOpts } = await import("@/lib/db"); const { checkAllVisitors } = await import("@/lib/alerts/checker");
    const { setPrefs } = await import("@/lib/prefs"); const { listPurchases } = await import("@/lib/purchases");
    const ab = { enabled: true, maxPrice: 10000, monthlyCap: null, mode: "approval" as const };
    await run("DELETE FROM watches"); await run("DELETE FROM purchases");
    for (const v of [A, B]) await run("INSERT INTO watches (visitor, product_id, target, last_price, created, opts) VALUES (?,?,?,?,?,?)", [v, "kindle-paperwhite", null, 9999, new Date().toISOString(), serializeWatchOpts({ autoBuy: ab })]);
    await withVisitor(A, () => setPrefs({ monthlyBudget: 1 })); // A's tiny budget blocks auto-buy; B has none
    const out = await checkAllVisitors("http://localhost:3000");
    expect(out.visitors).toBe(2); expect(out.results.length).toBe(2);
    expect(await withVisitor(A, () => listPurchases())).toEqual([]);
    expect((await withVisitor(B, () => listPurchases()))[0].status).toBe("pending_approval");
    const { query } = await import("@/lib/db");
    const titles = async (v: string) => (await query("SELECT title FROM notifications WHERE visitor = ?", [v])).map((r) => String(r.title));
    expect((await titles(B)).some((t) => /Approve auto-buy/.test(t))).toBe(true);
    expect((await titles(A)).some((t) => /auto-buy/i.test(t))).toBe(false);
  });
  it("public share links resolve to their owner without the owner's cookie", async () => {
    const { getShareToken, shareOwner, sharedList, rotateShareToken } = await import("@/lib/share");
    const t = await withVisitor(B, () => getShareToken(true)) as string;
    expect(await shareOwner(t)).toBe(B);
    expect(await withVisitor(A, () => shareOwner(t))).toBe(B);
    expect((await withVisitor(B, () => sharedList())).map((i) => i.productId)).toEqual(["kindle-paperwhite"]);
    expect(await shareOwner("0".repeat(24))).toBeNull(); expect(await shareOwner("nope")).toBeNull();
    const t2 = await withVisitor(B, () => rotateShareToken());
    expect(await shareOwner(t)).toBeNull(); expect(await shareOwner(t2)).toBe(B);
    const legacy = await getShareToken(true) as string; // default visitor (pre-migration style)
    expect(await shareOwner(legacy)).toBe("default");
  });
});

describe("demo data", () => {
  it("seeds a full demo account for one visitor and resets only that visitor", async () => {
    const { seedDemo, resetVisitorData, DEMO_WATCHES } = await import("@/lib/demo");
    const { query } = await import("@/lib/db"); const { listClaims } = await import("@/lib/protection"); const { listPurchases } = await import("@/lib/purchases");
    const C = "visitorCCCC3";
    const r = await withVisitor(C, () => seedDemo("http://x"));
    expect(r.shareUrl).toMatch(/^http:\/\/x\/w\/[a-f0-9]{24}$/);
    expect((await query("SELECT COUNT(*) AS n FROM watches WHERE visitor = ?", [C]))[0].n).toBe(DEMO_WATCHES.length);
    expect((await query("SELECT factor FROM sim_drops WHERE visitor = ?", [C])).length).toBe(1);
    expect((await withVisitor(C, () => listPurchases()))[0].status).toBe("completed");
    expect((await withVisitor(C, () => listClaims())).length).toBe(1);
    expect(Number((await query("SELECT COUNT(*) AS n FROM notifications WHERE visitor = ?", [C]))[0].n)).toBeGreaterThanOrEqual(1);
    await withVisitor(C, () => seedDemo("http://x")); // idempotent
    expect((await withVisitor(C, () => listPurchases())).length).toBe(1);
    const otherBefore = (await query("SELECT COUNT(*) AS n FROM watches WHERE visitor <> ?", [C]))[0].n;
    await withVisitor(C, () => resetVisitorData());
    expect((await query("SELECT COUNT(*) AS n FROM watches WHERE visitor = ?", [C]))[0].n).toBe(0);
    expect(await withVisitor(C, () => listClaims())).toEqual([]);
    expect((await query("SELECT COUNT(*) AS n FROM kv WHERE k LIKE ?", [`v:${C}:%`]))[0].n).toBe(0);
    expect((await query("SELECT COUNT(*) AS n FROM watches WHERE visitor <> ?", [C]))[0].n).toBe(otherBefore);
  });
});
