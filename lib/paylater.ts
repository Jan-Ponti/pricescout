/**
 * PayPal Pay Later ESTIMATES (US). Real eligibility, terms and APR come from PayPal at checkout;
 * the official PayPal JS SDK "messages" component is rendered next to these when a client ID is available.
 * Pay in 4: 4 interest-free payments on purchases of $30–$1,500. Pay Monthly: $199–$10,000 over 6/12/24 months (APR varies).
 */
export interface PayLater { payIn4: { installment: number; total: number } | null; monthly: { months: number; perMonth: number } | null; label: string }
const r2 = (n: number) => Math.round(n * 100) / 100;
export const PAY_IN_4 = { min: 30, max: 1500 }; export const PAY_MONTHLY = { min: 199, max: 10000 };
export function payLaterOptions(amount: number): PayLater {
  const a = r2(amount);
  // First three installments are rounded down; the last absorbs the remainder so the total matches.
  const inst = Math.floor(Math.round(a * 100) / 4) / 100;
  const payIn4 = a >= PAY_IN_4.min && a <= PAY_IN_4.max ? { installment: inst, total: a } : null;
  const monthly = a >= PAY_MONTHLY.min && a <= PAY_MONTHLY.max ? { months: 12, perMonth: r2(a / 12) } : null;
  const parts: string[] = [];
  if (payIn4) parts.push(`4 interest-free payments of ~$${payIn4.installment.toFixed(2)}`);
  if (monthly) parts.push(`or ~$${monthly.perMonth.toFixed(2)}/mo for 12 months before interest`);
  return { payIn4, monthly, label: parts.length ? `PayPal Pay Later: ${parts.join(" ")} (estimate)` : "" };
}
