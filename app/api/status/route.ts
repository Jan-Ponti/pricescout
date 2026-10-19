import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { paypalConfigured } from "@/lib/paypal";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json({ ai: aiEnabled(), paypal: paypalConfigured(), env: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox" }); }
