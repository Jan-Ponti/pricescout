import type { Product } from "./types";
export const CATALOG: Product[] = [
  { id: "sony-wh1000xm5", name: "Sony WH-1000XM5 Wireless Noise Canceling Headphones", brand: "Sony", category: "Headphones", image: "🎧", msrp: 399.99, aliases: ["xm5", "sony headphones", "wh-1000xm5", "1000xm5", "noise canceling headphones"] },
  { id: "airpods-pro-2", name: "Apple AirPods Pro (2nd Gen, USB-C)", brand: "Apple", category: "Earbuds", image: "🎵", msrp: 249.0, aliases: ["airpods", "airpods pro", "apple earbuds"] },
  { id: "nintendo-switch-oled", name: "Nintendo Switch – OLED Model", brand: "Nintendo", category: "Gaming", image: "🎮", msrp: 349.99, aliases: ["switch", "switch oled", "nintendo"] },
  { id: "kindle-paperwhite", name: "Kindle Paperwhite (16 GB)", brand: "Amazon", category: "E-readers", image: "📖", msrp: 159.99, aliases: ["kindle", "paperwhite", "e-reader", "ereader"] },
  { id: "dyson-v15", name: "Dyson V15 Detect Cordless Vacuum", brand: "Dyson", category: "Home", image: "🧹", msrp: 749.99, aliases: ["dyson", "v15", "vacuum", "cordless vacuum"] },
  { id: "instant-pot-duo", name: "Instant Pot Duo 7-in-1 (6 Qt)", brand: "Instant Pot", category: "Kitchen", image: "🍲", msrp: 99.95, aliases: ["instant pot", "pressure cooker", "instapot"] },
  { id: "lego-millennium-falcon", name: "LEGO Star Wars Millennium Falcon 75257", brand: "LEGO", category: "Toys", image: "🚀", msrp: 169.99, aliases: ["lego", "millennium falcon", "lego star wars"] },
  { id: "logitech-mx-master-3s", name: "Logitech MX Master 3S Wireless Mouse", brand: "Logitech", category: "Accessories", image: "🖱️", msrp: 99.99, aliases: ["mx master", "logitech mouse", "mouse", "mx master 3s"] },
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
/** Deterministic matcher used directly and as the no-LLM fallback. */
export function matchProduct(query: string): Product | null {
  const q = norm(query);
  let best: { p: Product; score: number } | null = null;
  for (const p of CATALOG) {
    let score = 0;
    for (const a of [p.id.replace(/-/g, " "), p.name, ...p.aliases]) {
      const n = norm(a);
      if (q.includes(n)) score = Math.max(score, n.length + 10);
      else { const hits = n.split(" ").filter((w) => w.length > 2 && q.split(" ").includes(w)).length; score = Math.max(score, hits * 3); }
    }
    if (score > 0 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}
export const getProduct = (id: string) => CATALOG.find((p) => p.id === id) ?? null;
