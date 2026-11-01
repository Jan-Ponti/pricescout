import { NextResponse } from "next/server";
import { listPurchases, spentThisMonth } from "@/lib/purchases";
import { getPrefs } from "@/lib/prefs";
import { budgetStatus } from "@/lib/budget";
export const dynamic = "force-dynamic";
export async function GET() { const spent = await spentThisMonth(); return NextResponse.json({ purchases: await listPurchases(), spentThisMonth: spent, budget: budgetStatus(spent, (await getPrefs()).monthlyBudget) }); }
