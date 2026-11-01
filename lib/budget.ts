import type { Prediction } from "./types";
import { round2 } from "./rand";
export interface BudgetStatus { monthlyBudget: number | null; spent: number; remaining: number | null; pct: number | null }
/** Pure: monthly budget status from committed spend (completed + pending purchases this month). */
export function budgetStatus(spent: number, monthlyBudget?: number | null): BudgetStatus {
  if (monthlyBudget == null || !(monthlyBudget > 0)) return { monthlyBudget: null, spent, remaining: null, pct: null };
  return { monthlyBudget, spent, remaining: round2(Math.max(0, monthlyBudget - spent)), pct: Math.round((spent / monthlyBudget) * 100) };
}
/** Pure: a buy that would blow the monthly budget becomes WAIT, whatever the price signal says. */
export function applyBudget(pred: Prediction, price: number, b: BudgetStatus): Prediction {
  if (b.remaining == null) return pred;
  if (price > b.remaining + 1e-9) {
    return { ...pred, verdict: "wait", confidence: Math.max(pred.confidence, 80),
      reasons: [`Over your monthly budget: $${b.remaining.toFixed(2)} left of $${b.monthlyBudget!.toFixed(2)}`, ...pred.reasons].slice(0, 4) };
  }
  return { ...pred, reasons: [...pred.reasons, `Fits your monthly budget ($${b.remaining.toFixed(2)} left)`].slice(0, 4) };
}
