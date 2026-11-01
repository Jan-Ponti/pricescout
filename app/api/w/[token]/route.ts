import { NextResponse } from "next/server";
import { tokenMatches, sharedList } from "@/lib/share";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!(await tokenMatches(params.token))) return NextResponse.json({ error: "This wishlist link is invalid or was revoked." }, { status: 404 });
  return NextResponse.json({ items: await sharedList() });
}
