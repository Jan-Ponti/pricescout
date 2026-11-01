import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { ruleSummary } from "@/lib/reviews";
import { mockReviews } from "@/lib/providers/mockReviews";
import { getProduct } from "@/lib/catalog";
beforeAll(() => { process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ps-rv-")); delete process.env.DATABASE_URL; delete process.env.OPENAI_API_KEY; });
describe("review summaries", () => {
  it("rule summary finds pros, cons and repeated complaints from mock reviews", () => {
    const p = getProduct("nintendo-switch-oled")!; const s = ruleSummary(p, mockReviews(p));
    expect(s.source).toBe("mock"); expect(s.pros).toContain("screen"); expect(s.complaints).toContain("Joy-Con drift"); expect(s.avgRating).toBeGreaterThan(3);
  });
  it("is cached per product", async () => {
    const { getReviewSummary } = await import("@/lib/reviews"); const p = getProduct("dyson-v15")!;
    const a = await getReviewSummary(p); const b = await getReviewSummary(p);
    expect(a.via).toBe("rules"); expect(b.generated).toBe(a.generated); expect(a.cons).toContain("small bin");
    expect((await getReviewSummary(p, { refresh: true })).generated >= a.generated).toBe(true);
  });
  it("every catalog product has mock reviews", async () => { const { CATALOG } = await import("@/lib/catalog"); for (const p of CATALOG) expect(mockReviews(p).length).toBeGreaterThan(3); });
});
