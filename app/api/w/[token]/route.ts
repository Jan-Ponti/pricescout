import { NextResponse } from "next/server";
import { sharedList, shareOwner } from "@/lib/share";
import { withVisitor } from "@/lib/visitor";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const owner = await shareOwner(params.token);
  if (!owner) return NextResponse.json({ error: "This wishlist link is invalid or was revoked." }, { status: 404 });
  return NextResponse.json({ items: await withVisitor(owner, () => sharedList()) });
}
