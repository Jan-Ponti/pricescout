import { describe, it, expect, beforeAll } from "vitest";
import { parseProductUrl, findUrl, identifyFromUrl, identifyFromImage, matchFromFilename } from "@/lib/identify";
beforeAll(() => { delete process.env.OPENAI_API_KEY; });
describe("product links", () => {
  it("finds and parses retailer URLs", () => {
    expect(findUrl("track this https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH?th=1 please")).toMatch(/^https:\/\/www.amazon.com/);
    const a = parseProductUrl("https://www.amazon.com/Sony-WH-1000XM5-Canceling-Headphones/dp/B09XS7JWHH")!;
    expect(a.retailer).toBe("Amazon"); expect(a.words).toBe("Sony WH 1000XM5 Canceling Headphones");
    expect(parseProductUrl("https://www.bestbuy.com/site/nintendo-switch-oled-model-white/6470923.p")!.words).toBe("nintendo switch oled model white");
    expect(parseProductUrl("javascript:alert(1)")).toBeNull();
  });
  it("matches links to the catalog without an AI key", async () => {
    expect((await identifyFromUrl("https://www.bestbuy.com/site/nintendo-switch-oled-model-white/6470923.p")).product?.id).toBe("nintendo-switch-oled");
    expect((await identifyFromUrl("https://www.walmart.com/ip/Instant-Pot-Duo-7-in-1/123456")).product?.id).toBe("instant-pot-duo");
    expect((await identifyFromUrl("https://example.com/")).product).toBeNull();
  });
});
describe("photos", () => {
  it("falls back to filename keywords without an AI key", async () => {
    expect(matchFromFilename("my_kindle-paperwhite.jpg")?.id).toBe("kindle-paperwhite");
    const r = await identifyFromImage("data:image/png;base64,iVBORw0KGgo=", "IMG_dyson_v15.png"); expect(r.product?.id).toBe("dyson-v15"); expect(r.via).toBe("rules");
    expect((await identifyFromImage("data:image/png;base64,AAAA", "IMG_0001.png")).product).toBeNull();
  });
});
