import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { Timeline } from "@/lib/timeline";
import { totalSaved, newAutoBuys } from "@/lib/savings";
import { withVisitor } from "@/lib/visitor";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-b-")); delete process.env.DATABASE_URL; for (const k of ["OPENAI_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "RESEND_API_KEY", "SMTP_HOST", "TWILIO_ACCOUNT_SID", "VAPID_PUBLIC_KEY"]) delete process.env[k]; });
const src = (f: string) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

describe("agent timeline", () => {
  it("records each tool call with timing, detail and failures", async () => {
    let t = 0; const tl = new Timeline(() => (t += 5));
    expect(await tl.run("a", "Step A", async () => 42, (x) => `got ${x}`)).toBe(42);
    await expect(tl.run("b", "Step B", () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(tl.steps).toEqual([{ tool: "a", label: "Step A", ms: 5, ok: true, detail: "got 42" }, { tool: "b", label: "Step B", ms: 5, ok: false, detail: "boom" }]);
  });
  it("chat responses include the real tool calls in order", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const res = await withVisitor("timelineV1", () => POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ message: "best price on Sony WH-1000XM5" }) })));
    const j = await res.json();
    expect(j.steps.map((s: { tool: string }) => s.tool)).toEqual(["getPrefs", "identifyProduct", "analyze", "advise"]);
    expect(j.steps.every((s: { ok: boolean }) => s.ok)).toBe(true);
    expect(j.steps[1].detail).toMatch(/Sony/);
  });
  it("errors still carry steps", async () => {
    const { POST } = await import("@/app/api/chat/route");
    const j = await (await POST(new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ message: "asdkjh qwe" }) }))).json();
    expect(j.product).toBeNull(); expect(Array.isArray(j.steps)).toBe(true);
  });
});

describe("savings + auto-buy toast", () => {
  it("sums savings vs MSRP, skipping failed/cancelled, unknown products and never negative", () => {
    expect(totalSaved([
      { product_id: "sony-wh1000xm5", amount: 299.99, status: "completed" },
      { product_id: "kindle-paperwhite", amount: 200, status: "pending_approval" },
      { product_id: "airpods-pro-2", amount: 1, status: "failed" },
      { product_id: "nope", amount: 1, status: "completed" },
    ])).toEqual({ saved: 100, count: 2 });
  });
  it("picks only unseen auto-buys with an order id", () => {
    const ps = [{ id: "1", source: "auto-buy", order_id: "O1" }, { id: "2", source: "auto-buy", order_id: null }, { id: "3", source: "chat", order_id: "O3" }, { id: "4", source: "auto-buy", order_id: "O4" }];
    expect(newAutoBuys(ps, new Set(["4"])).map((p) => p.id)).toEqual(["1"]);
  });
  it("/api/purchases returns the saved figure", async () => {
    const { addPurchase } = await import("@/lib/purchases"); const { GET } = await import("@/app/api/purchases/route");
    const j = await withVisitor("savedVis01", async () => {
      await addPurchase({ order_id: "X", product_id: "logitech-mx-master-3s", product_name: "MX", retailer: "Amazon", amount: 79.99, status: "completed", mode: "approval", source: "chat", approve_url: null, note: null });
      return (await GET()).json();
    });
    expect(j.saved).toEqual({ saved: 20, count: 1 });
  });
});

describe("shared link 404 + deep link", () => {
  it("bad, malformed and revoked tokens have no owner", async () => {
    const { shareOwner, getShareToken, revokeShareToken } = await import("@/lib/share");
    expect(await shareOwner("zzz")).toBeNull();
    expect(await shareOwner("0".repeat(24))).toBeNull();
    const t = await withVisitor("shareVis001", () => getShareToken(true));
    expect(await shareOwner(t)).toBe("shareVis001");
    await withVisitor("shareVis001", () => revokeShareToken());
    expect(await shareOwner(t)).toBeNull();
  });
  it("the /w/[token] layout calls notFound() and the API 404s", async () => {
    expect(src("app/w/[token]/layout.tsx")).toMatch(/notFound\(\)/);
    expect(fs.existsSync(path.join(__dirname, "..", "app/not-found.tsx"))).toBe(true);
    const { GET } = await import("@/app/api/w/[token]/route");
    const r = await GET(new Request("http://x/api/w/" + "a".repeat(24)), { params: { token: "a".repeat(24) } });
    expect(r.status).toBe(404);
  });
  it("home page handles ?product= deep links", () => { expect(src("app/page.tsx")).toMatch(/q\.get\("product"\)/); });
});

describe("accessibility + mobile markup", () => {
  const page = src("app/page.tsx");
  it("checkout is a modal dialog with focus trap and Escape", () => {
    expect(page).toMatch(/role="dialog" aria-modal="true" aria-labelledby="checkout-title"/);
    const a = src("app/a11y.ts"); expect(a).toMatch(/"Escape"/); expect(a).toMatch(/"Tab"/);
  });
  it("chat log is a live region and controls are labelled", () => {
    expect(page).toMatch(/role="log" aria-live="polite"/);
    expect(page).toMatch(/aria-label="Send message"/);
    expect(src("app/Alerts.tsx")).not.toMatch(/aria-label="(target|near-low|autobuy-max)"/);
  });
  it("mobile tabs and card tables exist under 700px", () => {
    for (const t of ["Chat", "Deal", "Watchlist", "Account"]) expect(page).toMatch(new RegExp(`data-tab="${t}"`));
    const css = src("app/globals.css"); expect(css).toMatch(/max-width:700px/); expect(css).toMatch(/table\.cards td::before/);
  });
});
