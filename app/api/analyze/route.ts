import { NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog";
import { analyze } from "@/lib/service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const p = getProduct(new URL(req.url).searchParams.get("productId") || ""); if (!p) return NextResponse.json({ error: "unknown product" }, { status: 404 });
  return NextResponse.json({ product: p, ...(await analyze(p)) });
}
