import { describe, it, expect } from "vitest";
import fs from "node:fs";
describe("scheduled price-check workflow", () => {
  const y = fs.readFileSync(".github/workflows/check-prices.yml", "utf8");
  it("runs hourly and on demand", () => { expect(y).toMatch(/cron: "\d+ \* \* \* \*"/); expect(y).toContain("workflow_dispatch"); });
  it("POSTs to the cron endpoint with the bearer secret", () => {
    expect(y).toContain("-X POST"); expect(y).toContain('Authorization: Bearer $CRON_SECRET'); expect(y).toContain("/api/cron/check-prices");
    expect(y).toContain("secrets.CRON_SECRET"); expect(y).toContain("secrets.APP_URL");
  });
});
