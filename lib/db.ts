import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import type { PricePoint } from "./types";
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "prices.sqlite");
let dbp: Promise<Database> | null = null;
export function getDb(): Promise<Database> {
  if (!dbp) dbp = (async () => {
    const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f) });
    const db = fs.existsSync(FILE) ? new SQL.Database(fs.readFileSync(FILE)) : new SQL.Database();
    db.run(`CREATE TABLE IF NOT EXISTS snapshots (product_id TEXT, retailer TEXT, date TEXT, price REAL, PRIMARY KEY(product_id, retailer, date));
            CREATE TABLE IF NOT EXISTS watches (product_id TEXT PRIMARY KEY, target REAL, last_price REAL, created TEXT);
            CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, json TEXT);
            CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT, title TEXT, body TEXT, url TEXT, created TEXT, read INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS sim_drops (product_id TEXT PRIMARY KEY, factor REAL);
            CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
            CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, product_id TEXT, retailer TEXT, amount REAL, status TEXT, created TEXT);`);
    return db;
  })();
  return dbp;
}
export function persist(db: Database) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(FILE, Buffer.from(db.export())); }
export async function saveSnapshots(productId: string, pts: PricePoint[]) {
  const db = await getDb(); const st = db.prepare("INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?)");
  db.run("BEGIN"); for (const p of pts) st.run([productId, p.retailer, p.date, p.price]); db.run("COMMIT"); st.free(); persist(db);
}
export async function hasHistory(productId: string) {
  const db = await getDb(); const r = db.exec("SELECT COUNT(*) FROM snapshots WHERE product_id = ?", [productId]);
  return Number(r[0]?.values[0][0] ?? 0) > 0;
}
export async function getHistory(productId: string, sinceDate?: string): Promise<PricePoint[]> {
  const db = await getDb();
  const r = db.exec("SELECT date, retailer, price FROM snapshots WHERE product_id = ? AND date >= ? ORDER BY date", [productId, sinceDate ?? "0000"]);
  return (r[0]?.values ?? []).map(([date, retailer, price]) => ({ date: String(date), retailer: String(retailer), price: Number(price) }));
}
export async function recordOrder(id: string, productId: string, retailer: string, amount: number, status: string) {
  const db = await getDb(); db.run("INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?,?)", [id, productId, retailer, amount, status, new Date().toISOString()]); persist(db);
}

export async function query(sql: string, params: (string | number | null)[] = []) {
  const db = await getDb(); const r = db.exec(sql, params)[0]; if (!r) return [] as Record<string, any>[];
  return r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])));
}
export async function run(sql: string, params: (string | number | null)[] = []) { const db = await getDb(); db.run(sql, params); persist(db); }
export async function getSimFactor(productId: string) { return Number((await query("SELECT factor FROM sim_drops WHERE product_id = ?", [productId]))[0]?.factor ?? 1); }
