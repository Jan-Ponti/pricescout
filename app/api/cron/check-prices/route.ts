import { NextResponse } from "next/server";
import { checkWatches } from "@/lib/alerts/checker";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ checkedAt: new Date().toISOString(), results: await checkWatches(new URL(req.url).origin) });
}
export const GET = handle; export const POST = handle;
