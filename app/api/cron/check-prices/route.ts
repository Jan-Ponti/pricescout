import { publicOrigin } from "@/lib/origin";
import { NextResponse } from "next/server";
import { checkAllVisitors } from "@/lib/alerts/checker";
export const dynamic = "force-dynamic";
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { results, protection, visitors } = await checkAllVisitors(publicOrigin(req));
  return NextResponse.json({ checkedAt: new Date().toISOString(), visitors, results, protection });
}
export const GET = handle; export const POST = handle;
