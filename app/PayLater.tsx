"use client";
import { useEffect, useRef } from "react";
import { payLaterOptions } from "@/lib/paylater";
declare global { interface Window { paypal?: any } }
let sdk: Promise<void> | null = null;
function loadSdk(clientId: string) {
  if (!sdk) sdk = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&components=messages&currency=USD`;
    s.dataset.namespace = "paypal"; s.onload = () => res(); s.onerror = () => { sdk = null; rej(new Error("PayPal SDK failed")); };
    document.head.appendChild(s);
  });
  return sdk;
}
/** Official PayPal Pay Later message (JS SDK, sandbox client ID) plus our own computed estimate as a fallback. */
export default function PayLater({ amount, clientId, compact }: { amount: number; clientId?: string | null; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const est = payLaterOptions(amount);
  useEffect(() => {
    if (!clientId || !ref.current) return;
    let live = true;
    loadSdk(clientId).then(() => { if (live && ref.current && window.paypal?.Messages) window.paypal.Messages({ amount, placement: "product", style: { layout: "text", logo: { type: "inline" }, text: { size: 12 } } }).render(ref.current).catch(() => {}); }).catch(() => {});
    return () => { live = false; };
  }, [clientId, amount]);
  if (!est.payIn4 && !est.monthly) return null;
  return (<div className="paylater" data-testid="paylater">
    {!compact && clientId && <div ref={ref} />}
    <small className="note" style={{ margin: 0 }}>
      {est.payIn4 ? <>Pay in 4: <b>${est.payIn4.installment.toFixed(2)}</b> ×4</> : null}
      {est.payIn4 && est.monthly ? " · " : ""}
      {est.monthly ? <>~${est.monthly.perMonth.toFixed(2)}/mo ×12</> : null}
      <span title="Computed estimate. PayPal decides eligibility and terms at checkout."> (est.)</span>
    </small>
  </div>);
}
