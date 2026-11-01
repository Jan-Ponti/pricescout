import type { ShopperPrefs } from "./types";

/** Rough US sales-tax estimate by ZIP prefix (demo rates — not legal advice). */
const ZIP_TAX: Record<string, number> = {
  "100": 0.0888, "101": 0.0888, "112": 0.0888, // NYC
  "900": 0.095, "902": 0.095, "941": 0.08625,  // CA
  "606": 0.1025, "600": 0.1,                   // IL
  "770": 0.0825, "750": 0.0825,                // TX
  "331": 0.07, "328": 0.07,                    // FL
  "981": 0.1035, "980": 0.103,                 // WA
  "021": 0.0625, "022": 0.0625,                // MA
  "303": 0.089, "300": 0.07,                   // GA
  "802": 0.0881, "800": 0.0785,                // CO
  "482": 0.06, "481": 0.06, "480": 0.06,       // MI (Detroit area)
  "191": 0.08, "190": 0.06,                    // PA
};
export function taxRateForZip(zip?: string | null): number {
  if (!zip) return 0.07;
  const digits = String(zip).replace(/\D/g, "");
  if (digits.length < 3) return 0.07;
  return ZIP_TAX[digits.slice(0, 3)] ?? 0.07;
}

export const DEFAULT_PREFS: ShopperPrefs = { zip: "", memberships: [], allowOpenBox: false, allowRefurbished: false };

export async function getPrefs(): Promise<ShopperPrefs> {
  const { query } = await import("./db");
  const row = (await query("SELECT v FROM kv WHERE k = 'shopper_prefs'"))[0];
  if (!row) return { ...DEFAULT_PREFS };
  try { return { ...DEFAULT_PREFS, ...JSON.parse(String(row.v)) }; } catch { return { ...DEFAULT_PREFS }; }
}
export async function setPrefs(patch: Partial<ShopperPrefs>): Promise<ShopperPrefs> {
  const { run } = await import("./db");
  const next = { ...(await getPrefs()), ...patch };
  if (next.zip != null) next.zip = String(next.zip).replace(/\D/g, "").slice(0, 5);
  if (next.budget != null && !(Number(next.budget) > 0)) next.budget = undefined;
  if (next.needBy != null && next.needBy !== "" && Number.isNaN(Date.parse(next.needBy))) next.needBy = undefined;
  if (next.protectionDays != null && !(Number(next.protectionDays) > 0 && Number(next.protectionDays) <= 365)) next.protectionDays = undefined;
  await run("INSERT OR REPLACE INTO kv VALUES ('shopper_prefs', ?)", [JSON.stringify(next)]);
  return next;
}

/** Pull budget / ZIP / deadline / condition prefs out of free-text chat. */
export function parseConstraints(message: string): Partial<ShopperPrefs> {
  const out: Partial<ShopperPrefs> = {};
  const under = message.match(/\b(?:under|below|max(?:imum)?|budget(?:\s*(?:of|is)?)?|no more than)\s*\$?\s*(\d+(?:\.\d+)?)\b/i)
    || message.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:or less|max|ceiling)\b/i);
  if (under) out.budget = Number(under[1]);
  const zip = message.match(/\b(?:zip(?:code)?|postal)\s*[#:.]?\s*(\d{5})\b/i);
  if (zip) out.zip = zip[1];
  const byIso = message.match(/\b(?:by|before|need(?:ed)? by|arrive by|deliver(?:ed)? by)\s+(\d{4}-\d{2}-\d{2})\b/i);
  if (byIso) out.needBy = byIso[1];
  else {
    const rel = message.match(/\b(?:by|before|need(?:ed)? by|arrive by)\s+(friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|next week)\b/i);
    if (rel) out.needBy = relativeDate(rel[1].toLowerCase());
  }
  if (/\bopen[-\s]?box\b/i.test(message) && /\bok|okay|fine|allow|yes\b/i.test(message))
    out.allowOpenBox = true;
  else if (/\bopen[-\s]?box\s+ok\b/i.test(message)) out.allowOpenBox = true;
  if (/\brefurb(ished)?\b/i.test(message) && /\bok|okay|fine|allow|yes\b/i.test(message)) out.allowRefurbished = true;
  const mems: Array<"prime" | "plus" | "walmart+"> = [];
  if (/\bprime\b/i.test(message)) mems.push("prime");
  if (/\bwalmart\+?\b/i.test(message) || /\bw\+\b/i.test(message)) mems.push("walmart+");
  if (/\btarget\s*plus\b|\bplus\s*member/i.test(message)) mems.push("plus");
  if (mems.length) out.memberships = mems;
  return out;
}

function relativeDate(word: string): string {
  const now = new Date(); const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (word === "tomorrow") d.setUTCDate(d.getUTCDate() + 1);
  else if (word === "next week") d.setUTCDate(d.getUTCDate() + 7);
  else {
    const want = days.indexOf(word); let add = (want - d.getUTCDay() + 7) % 7; if (add === 0) add = 7; d.setUTCDate(d.getUTCDate() + add);
  }
  return d.toISOString().slice(0, 10);
}
