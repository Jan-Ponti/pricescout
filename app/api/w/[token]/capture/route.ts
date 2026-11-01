import { NextResponse } from "next/server";
import { finishGift } from "@/lib/share";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const { orderId } = await req.json().catch(() => ({}));
  try { return NextResponse.json(await finishGift(params.token, String(orderId ?? ""))); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: (e as any).status ?? 500 }); }
}
