import { NextResponse } from "next/server";
import { vapidKeys } from "@/lib/alerts/channels";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ publicKey: (await vapidKeys()).publicKey }); }
