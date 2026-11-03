import { publicOrigin } from "@/lib/origin";
import { NextResponse } from "next/server";
import { listClaims, checkProtection, windowDays } from "@/lib/protection";
import { appUrl } from "@/lib/alerts/checker";
import { getPrefs } from "@/lib/prefs";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ claims: await listClaims(), windowDays: windowDays((await getPrefs()).protectionDays) }); }
/** Re-check purchases now (also runs from the cron endpoint). Drafts are stored for copying only — never sent. */
export async function POST(req: Request) { const results = await checkProtection(appUrl(publicOrigin(req))); return NextResponse.json({ results, claims: await listClaims() }); }
