import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "PriceScout — AI shopping agent with PayPal", description: "Tracks prices, finds coupons, charts history, and checks out with PayPal." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
