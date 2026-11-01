import { query, run } from "./db";
export type PurchaseStatus = "pending_approval" | "completed" | "failed" | "cancelled";
export interface Purchase {
  id: string; order_id: string | null; product_id: string; product_name: string; retailer: string; amount: number;
  status: PurchaseStatus; mode: string; source: string; approve_url: string | null; note: string | null; created: string; updated: string;
}
const COLS = "id, order_id, product_id, product_name, retailer, amount, status, mode, source, approve_url, note, created, updated";
const norm = (r: Record<string, any>): Purchase => ({ ...(r as Purchase), amount: Number(r.amount) });

export async function addPurchase(p: Omit<Purchase, "id" | "created" | "updated"> & { id?: string; created?: string }): Promise<Purchase> {
  const now = new Date().toISOString();
  const row: Purchase = { ...p, id: p.id ?? crypto.randomUUID(), created: p.created ?? now, updated: now };
  await run(`INSERT OR REPLACE INTO purchases (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [row.id, row.order_id, row.product_id, row.product_name, row.retailer, row.amount, row.status, row.mode, row.source, row.approve_url, row.note, row.created, row.updated]);
  return row;
}
export async function setPurchaseStatusByOrder(orderId: string, status: PurchaseStatus) {
  await run("UPDATE purchases SET status = ?, updated = ? WHERE order_id = ?", [status, new Date().toISOString(), orderId]);
}
export async function listPurchases(limit = 50): Promise<Purchase[]> {
  return (await query(`SELECT ${COLS} FROM purchases ORDER BY created DESC LIMIT ?`, [limit])).map(norm);
}
export const monthStart = (now = new Date()) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
/** Money committed this calendar month: completed purchases plus pending approvals (reserved so auto-buy can't overshoot). */
export async function spentThisMonth(now = new Date()): Promise<number> {
  const r = await query("SELECT COALESCE(SUM(amount), 0) AS s FROM purchases WHERE created >= ? AND status IN ('completed', 'pending_approval')", [monthStart(now)]);
  return Math.round(Number(r[0]?.s ?? 0) * 100) / 100;
}
