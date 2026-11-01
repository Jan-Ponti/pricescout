import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { run } from "@/lib/db";
import { getShareToken, rotateShareToken, revokeShareToken, tokenMatches, validToken, sharedList, startGift, finishGift, getGift } from "@/lib/share";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-sh-")); delete process.env.DATABASE_URL; for (const k of ["OPENAI_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY"]) delete process.env[k]; });
const req = new Request("http://localhost:3000/api/w/x/checkout");
const watch = (id: string) => run("INSERT OR REPLACE INTO watches (product_id, target, last_price, created, opts) VALUES (?,?,?,?,?)", [id, 100, 200, new Date().toISOString(), "{}"]);

describe("share tokens", () => {
  it("creates, reuses, rotates and revokes", async () => {
    expect(await getShareToken(false)).toBeNull();
    const t = (await getShareToken())!; expect(validToken(t)).toBe(true);
    expect(await getShareToken()).toBe(t); expect(await tokenMatches(t)).toBe(true);
    const t2 = await rotateShareToken(); expect(t2).not.toBe(t);
    expect(await tokenMatches(t)).toBe(false); expect(await tokenMatches("../etc")).toBe(false);
    await revokeShareToken(); expect(await tokenMatches(t2)).toBe(false);
  });
});

describe("gift checkout (simulated PayPal, no keys)", () => {
  it("shows a read-only list without private fields", async () => {
    await watch("sony-wh1000xm5"); await watch("airpods-pro-2");
    const items = await sharedList();
    expect(items.map((i) => i.productId).sort()).toEqual(["airpods-pro-2", "sony-wh1000xm5"]);
    expect(items[0]).not.toHaveProperty("target"); expect(items.every((i) => !i.gifted && i.price! > 0)).toBe(true);
  });
  it("PayPal redirect flow marks gifted only after capture", async () => {
    const t = (await getShareToken())!;
    const o = await startGift(req, t, "sony-wh1000xm5", "Sam <b>", "paypal");
    expect(o.approveUrl).toContain(`/w/${t}?gift=sony-wh1000xm5`);
    expect(await getGift("sony-wh1000xm5")).toBeNull();
    expect((await finishGift(t, o.orderId)).productId).toBe("sony-wh1000xm5");
    expect(await getGift("sony-wh1000xm5")).toMatchObject({ from: "Sam b" });
    await expect(finishGift(t, o.orderId)).rejects.toThrow(/unknown gift order/);
    await expect(startGift(req, t, "sony-wh1000xm5", "x", "card")).rejects.toThrow(/already gifted/);
    expect((await sharedList()).find((i) => i.productId === "sony-wh1000xm5")?.gifted).toBe(true);
  });
  it("sandbox card flow, and rejects bad tokens / unwatched items / forged orders", async () => {
    const t = (await getShareToken())!;
    expect((await startGift(req, t, "airpods-pro-2", "", "card")).status).toBe("COMPLETED");
    expect((await getGift("airpods-pro-2"))!.from).toBe("A friend");
    await expect(startGift(req, "0".repeat(24), "airpods-pro-2", "", "card")).rejects.toThrow(/invalid link/);
    await expect(startGift(req, t, "nintendo-switch-oled", "", "card")).rejects.toThrow(/not on this wishlist/);
    await expect(finishGift(t, "SIM123456")).rejects.toThrow(/unknown gift order/);
  });
});
