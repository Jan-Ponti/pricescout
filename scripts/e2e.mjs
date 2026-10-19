// Headless end-to-end smoke test + screenshots. Usage: npm start (in another shell) then `npm run e2e` (BASE_URL to override).
import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3000"; const shot = (p, n) => p.screenshot({ path: `screenshots/${n}.png`, fullPage: true });
const log = (...a) => console.log("•", ...a);
await fetch(`${BASE}/api/watch?productId=sony-wh1000xm5`, { method: "DELETE" });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.grantPermissions(["notifications"], { origin: BASE });
const page = await ctx.newPage(); page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
await page.goto(BASE); await shot(page, "01-empty");
await page.getByRole("button", { name: "Find me the best price on Sony WH-1000XM5" }).click();
await page.waitForSelector("tr.best", { timeout: 60000 }); await page.waitForSelector("[data-testid=lowest]");
log("chat reply:", (await page.locator(".msg.bot").last().innerText()).slice(0, 160).replace(/\n/g, " "));
log("best row:", (await page.locator("tr.best").innerText()).replace(/\s+/g, " "));
log("coupons:", await page.locator(".coupon").count()); await shot(page, "02-comparison");
for (const r of ["1W", "1M", "1Y", "All", "3M"]) { await page.getByRole("button", { name: r, exact: true }).click(); await page.waitForFunction((r) => document.querySelector("[data-testid=lowest]")?.textContent?.includes(`in ${r}:`), r); log(r, await page.locator("[data-testid=lowest]").innerText()); if (r === "1Y") await shot(page, "03-chart-1Y"); }
// Alerts
await page.getByLabel("target").fill("300"); await page.getByRole("button", { name: /Watch price/ }).click(); await page.waitForSelector("[data-testid=watchmsg]");
await page.getByRole("button", { name: "Enable browser push" }).click(); await page.waitForFunction(() => /Push/.test(document.querySelector("[data-testid=watchmsg]")?.textContent || ""), null, { timeout: 20000 }).catch(() => {});
log("push:", await page.locator("[data-testid=watchmsg]").innerText());
await page.getByRole("button", { name: /Simulate price drop/ }).click(); await page.waitForFunction(() => /Alert sent|no alert/.test(document.querySelector("[data-testid=watchmsg]")?.textContent || ""), null, { timeout: 30000 });
log("simulate:", await page.locator("[data-testid=watchmsg]").innerText());
await page.waitForTimeout(1500); await page.getByLabel("notifications").click(); await page.waitForSelector("[data-testid=notes] .notecard"); await shot(page, "04-alert-notification-center");
// One-click buy from alert -> approval modal -> sandbox test-card capture
await page.locator("[data-testid=notes] .notecard a").first().click(); await page.waitForSelector(".modal", { timeout: 30000 }); await shot(page, "05-approval-modal");
await page.getByRole("button", { name: "Instant sandbox test-card pay" }).click(); await page.waitForSelector("[data-testid=result]", { timeout: 60000 });
log("test-card checkout:", await page.locator("[data-testid=result]").innerText()); await shot(page, "06-checkout-captured");
// PayPal redirect flow (create order via Agent Toolkit -> PayPal approval page)
await page.getByRole("button", { name: "Approve & pay with PayPal" }).click(); await page.waitForURL(/paypal\.com|checkout\/return/, { timeout: 60000 });
log("redirected to:", page.url().replace(/token=.*/, "token=…")); await page.waitForTimeout(4000); await shot(page, "07-paypal-approval");
await browser.close();
