import { NextResponse } from "next/server";
import { identifyFromImage } from "@/lib/identify";
import { aiEnabled } from "@/lib/ai";
export const dynamic = "force-dynamic";
const MAX = 4 * 1024 * 1024;
/** Photo upload: {image: dataURL, filename, caption}. Returns the matched catalog product and offers to track it. */
export async function POST(req: Request) {
  const { image, filename, caption } = await req.json();
  if (typeof image !== "string" || image.length > MAX * 1.4) return NextResponse.json({ error: "image (data URL, ≤4 MB) required" }, { status: 400 });
  const r = await identifyFromImage(image, String(filename ?? ""), String(caption ?? ""));
  const reply = r.product
    ? `That looks like **${r.product.name}**${r.seen ? ` (${r.seen})` : ""}. Want me to start tracking it?`
    : `I couldn't match that photo to a product I can track${r.via === "rules" ? " (without an AI key I match on the file name)" : ""}. Try a product link or name.`;
  return NextResponse.json({ reply, product: r.product, via: r.via, offerTrack: !!r.product, ai: aiEnabled() });
}
