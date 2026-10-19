import { NextResponse } from "next/server";
import { getHistory } from "@/lib/db";
import { RANGES, sinceFor, toSeries, type Range } from "@/lib/history";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = new URL(req.url); const id = u.searchParams.get("productId"); const range = (u.searchParams.get("range") || "3M") as Range;
  if (!id || !(range in RANGES)) return NextResponse.json({ error: "bad params" }, { status: 400 });
  return NextResponse.json({ range, ...toSeries(await getHistory(id, sinceFor(range))) });
}
