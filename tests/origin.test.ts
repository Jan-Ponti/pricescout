import { describe, it, expect, afterEach } from "vitest";
import { publicOrigin } from "@/lib/origin";
const mk = (url: string, h: Record<string, string> = {}) => new Request(url, { headers: h });
afterEach(() => { delete process.env.APP_URL; });
describe("publicOrigin", () => {
  it("prefers APP_URL", () => { process.env.APP_URL = "https://pricescout-xret.onrender.com/"; expect(publicOrigin(mk("https://localhost:10000/api/demo", { host: "x.com" }))).toBe("https://pricescout-xret.onrender.com"); });
  it("uses forwarded headers", () => { expect(publicOrigin(mk("https://localhost:10000/api/demo", { "x-forwarded-proto": "https", "x-forwarded-host": "pricescout-xret.onrender.com, other", host: "localhost:10000" }))).toBe("https://pricescout-xret.onrender.com"); });
  it("falls back to host header", () => { expect(publicOrigin(mk("http://localhost:10000/x", { host: "example.com" }))).toBe("http://example.com"); });
  it("falls back to req.url", () => { const r = mk("http://localhost:3000/x"); r.headers.delete("host"); expect(publicOrigin(r)).toBe("http://localhost:3000"); });
  it("demo share link uses public origin", async () => { const { seedDemo } = await import("@/lib/demo"); expect(typeof seedDemo).toBe("function"); });
});
