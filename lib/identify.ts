import { CATALOG, matchProduct } from "./catalog";
import { aiJson, identifyProduct } from "./ai";
import type { Product } from "./types";

const RETAILERS: Record<string, string> = { "amazon": "Amazon", "bestbuy": "Best Buy", "walmart": "Walmart", "target": "Target", "ebay": "eBay", "costco": "Costco", "apple": "Apple", "newegg": "Newegg" };
export const findUrl = (text: string) => text.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? null;
/** Pull the retailer and human words out of a product URL: domain + path slug (IDs/hex dropped). */
export function parseProductUrl(raw: string): { domain: string; retailer: string | null; words: string } | null {
  let u: URL; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const domain = u.hostname.replace(/^www\./, "").toLowerCase();
  const key = Object.keys(RETAILERS).find((k) => domain.split(".").includes(k));
  const parts = decodeURIComponent(u.pathname).split(/[\/]/).filter(Boolean)
    .filter((s) => !/^(dp|gp|product|products|ip|p|site|skuid|item|itm|a|b|s|ref=.*|[A-Z0-9]{10}|\d+(\.p)?|[a-f0-9]{8,})$/i.test(s));
  const q = u.searchParams.get("q") || u.searchParams.get("k") || "";
  const words = [...parts, q].join(" ").replace(/\.(html?|p)$/i, "").replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim();
  return { domain, retailer: key ? RETAILERS[key] : null, words };
}
export async function identifyFromUrl(url: string): Promise<{ product: Product | null; via: "llm" | "rules"; parsed: ReturnType<typeof parseProductUrl> }> {
  const parsed = parseProductUrl(url);
  if (!parsed || !parsed.words) return { product: null, via: "rules", parsed };
  const r = await identifyProduct(`Product page on ${parsed.domain}: ${parsed.words}`);
  return { ...r, parsed };
}
/** Rule fallback for photos: match on the file name / any caption keywords. */
export const matchFromFilename = (name: string) => matchProduct(name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_.]+/g, " "));
/** Photo → product. gpt-4o-mini vision when a key is set; filename/keyword match otherwise. */
export async function identifyFromImage(dataUrl: string, filename = "", caption = ""): Promise<{ product: Product | null; via: "llm" | "rules"; seen?: string }> {
  const fb = matchFromFilename(`${filename} ${caption}`);
  if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl)) return { product: fb, via: "rules" };
  const { data, via } = await aiJson<{ id?: string | null; seen?: string }>(
    `Identify the product in the photo and map it to one id from this catalog, or null. Reply JSON {"id": string|null, "seen": short description}.\n${CATALOG.map((p) => `${p.id}: ${p.name}`).join("\n")}`,
    [{ type: "text", text: caption || "What product is this?" }, { type: "image_url", image_url: { url: dataUrl, detail: "low" } }], { id: undefined });
  if (via === "rules") return { product: fb, via };
  const product = CATALOG.find((p) => p.id === data.id) ?? null;
  return { product: product ?? fb, via: product ? "llm" : "rules", seen: data.seen };
}
