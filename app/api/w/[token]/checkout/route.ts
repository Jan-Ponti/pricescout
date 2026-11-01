import { NextResponse } from "next/server";
import { startGift } from "@/lib/share";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { productId, from, mode } = await req.json().catch(() => ({}));
  try { return NextResponse.json(await startGift(req, params.token, String(productId ?? ""), from, mode === "card" ? "card" : "paypal")); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: (e as any).status ?? 500 }); }
}
