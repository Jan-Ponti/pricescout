import { NextResponse } from "next/server";
import { getPrefs, setPrefs } from "@/lib/prefs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await getPrefs()); }
export async function POST(req: Request) {
  const body = await req.json();
  const prefs = await setPrefs({
    zip: body.zip, budget: body.budget === "" || body.budget == null ? undefined : Number(body.budget),
    needBy: body.needBy === "" ? undefined : body.needBy,
    allowOpenBox: !!body.allowOpenBox, allowRefurbished: !!body.allowRefurbished,
    protectionDays: body.protectionDays === "" || body.protectionDays == null ? undefined : Number(body.protectionDays),
    memberships: Array.isArray(body.memberships) ? body.memberships : undefined,
  });
  return NextResponse.json(prefs);
}
