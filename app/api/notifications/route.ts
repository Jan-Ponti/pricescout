import { currentVisitor, vk } from "@/lib/visitor";
import { NextResponse } from "next/server";
import { query, run } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(await query("SELECT * FROM notifications WHERE visitor = ? ORDER BY id DESC LIMIT 30", [currentVisitor()])); }
export async function POST() { await run("UPDATE notifications SET read = 1 WHERE visitor = ?", [currentVisitor()]); return NextResponse.json({ ok: true }); }
