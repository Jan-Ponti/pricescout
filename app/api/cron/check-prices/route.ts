import { NextResponse } from "next/server";
import { checkWatches, appUrl } from "@/lib/alerts/checker";
import { checkProtection } from "@/lib/protection";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ checkedAt: new Date().toISOString(), results: await checkWatches(new URL(req.url).origin), protection: await checkProtection(appUrl(new URL(req.url).origin)) });
}
export const GET = handle; export const POST = handle;
