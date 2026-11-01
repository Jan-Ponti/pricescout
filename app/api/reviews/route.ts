import { NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog";
import { getReviewSummary } from "@/lib/reviews";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams; const p = getProduct(q.get("productId") ?? "");
  if (!p) return NextResponse.json({ error: "unknown product" }, { status: 400 });
  return NextResponse.json(await getReviewSummary(p, { refresh: q.get("refresh") === "1" }));
}
