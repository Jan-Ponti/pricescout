import { NextResponse } from "next/server";
import { listPurchases, spentThisMonth } from "@/lib/purchases";
import { getPrefs } from "@/lib/prefs";
import { budgetStatus } from "@/lib/budget";
import { totalSaved } from "@/lib/savings";
export const dynamic = "force-dynamic";
export async function GET() {
  const spent = await spentThisMonth(); const purchases = await listPurchases();
  return NextResponse.json({ purchases, spentThisMonth: spent, budget: budgetStatus(spent, (await getPrefs()).monthlyBudget), saved: totalSaved(purchases) });
}
