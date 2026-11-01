import { NextResponse } from "next/server";
import { listPurchases, spentThisMonth } from "@/lib/purchases";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ purchases: await listPurchases(), spentThisMonth: await spentThisMonth() }); }
