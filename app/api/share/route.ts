import { publicOrigin } from "@/lib/origin";
import { NextResponse } from "next/server";
import { getShareToken, rotateShareToken, revokeShareToken } from "@/lib/share";
export const dynamic = "force-dynamic";
const url = (req: Request, t: string | null) => (t ? `${publicOrigin(req)}/w/${t}` : null);
export async function GET(req: Request) { return NextResponse.json({ url: url(req, await getShareToken(false)) }); }
/** body {action:"create"|"rotate"|"revoke"} */
export async function POST(req: Request) {
  const { action = "create" } = await req.json().catch(() => ({}));
  if (action === "revoke") { await revokeShareToken(); return NextResponse.json({ url: null }); }
  const t = action === "rotate" ? await rotateShareToken() : await getShareToken(true);
  return NextResponse.json({ url: url(req, t) });
}
