import { NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai";
import { paypalConfigured } from "@/lib/paypal";
import { usingPostgres } from "@/lib/db";
export const dynamic = "force-dynamic";
export function GET() { return NextResponse.json({ ai: aiEnabled(), paypal: paypalConfigured(), env: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox", db: usingPostgres() ? "postgres" : "sqlite",
  // Public client ID (safe to expose) for the PayPal JS SDK Pay Later messages component.
  paypalClientId: paypalConfigured() ? process.env.PAYPAL_CLIENT_ID : null }); }
