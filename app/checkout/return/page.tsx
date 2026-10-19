"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
function Inner() {
  const q = useSearchParams(); const token = q.get("token"); const [s, setS] = useState<string>("Capturing your PayPal payment…");
  useEffect(() => { if (!token) { setS("Missing PayPal order token."); return; }
    fetch("/api/checkout/capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: token }) })
      .then((r) => r.json()).then((c) => setS(c.error ? `❌ ${c.error}` : `✅ Payment ${c.status}. Order ${c.id}, capture ${c.captureId ?? "n/a"}${c.amount ? ` ($${c.amount})` : ""} via ${c.via}.`)); }, [token]);
  return <div className="card" style={{ maxWidth: 560, margin: "80px auto" }}><h2>PayPal checkout</h2><p data-testid="capture">{s}</p><a href="/"><button>Back to PriceScout</button></a></div>;
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
