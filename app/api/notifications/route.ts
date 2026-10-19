import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await query("SELECT * FROM notifications ORDER BY id DESC LIMIT 30")); }
export async function POST() { await run("UPDATE notifications SET read = 1"); return NextResponse.json({ ok: true }); }
