import { NextResponse } from "next/server";
import { seedDemo, resetVisitorData } from "@/lib/demo";
import { query } from "@/lib/db";
import { currentVisitor } from "@/lib/visitor";
export const dynamic = "force-dynamic";
/** Is this visitor's account empty? (drives the guided empty state) */
export async function GET() {
  const v = currentVisitor();
  const n = async (t: string) => Number((await query(`SELECT COUNT(*) AS n FROM ${t} WHERE visitor = ?`, [v]))[0]?.n ?? 0);
  const watches = await n("watches"); const purchases = await n("purchases");
  return NextResponse.json({ watches, purchases, empty: watches + purchases === 0 });
}
/** body {action: "seed" | "reset"} — only ever touches the calling visitor's data. */
export async function POST(req: Request) {
  const { action = "seed" } = await req.json().catch(() => ({}));
  try {
    if (action === "reset") return NextResponse.json(await resetVisitorData());
    return NextResponse.json(await seedDemo(new URL(req.url).origin));
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
