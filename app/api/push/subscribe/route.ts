import { currentVisitor, vk } from "@/lib/visitor";
import { NextResponse } from "next/server";
import { run } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const sub = await req.json();
  if (typeof sub?.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh) return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  await run("INSERT OR REPLACE INTO push_subs (endpoint, json, visitor) VALUES (?,?,?)", [sub.endpoint, JSON.stringify(sub), currentVisitor()]); return NextResponse.json({ ok: true });
}
