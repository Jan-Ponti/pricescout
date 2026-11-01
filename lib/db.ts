import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database } from "sql.js";
import type { PricePoint, WatchOpts } from "./types";
import { TABLES, createTableDdl, addColumnDdl, toPg } from "./schema";

type Param = string | number | null;
type Row = Record<string, any>;
/** Storage backend. SQLite (sql.js, file in DATA_DIR) by default; Postgres when DATABASE_URL is set. */
interface Backend { kind: "sqlite" | "postgres"; query(sql: string, params: Param[]): Promise<Row[]>; run(sql: string, params: Param[]): Promise<void>; runMany(sql: string, rows: Param[][]): Promise<void> }

const dataDir = () => process.env.DATA_DIR || path.join(process.cwd(), "data");
export const usingPostgres = () => Boolean(process.env.DATABASE_URL);

let sqliteP: Promise<Database> | null = null;
/** Low-level sql.js handle (SQLite mode only). */
export function getDb(): Promise<Database> {
  if (!sqliteP) sqliteP = (async () => {
    const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f) });
    const file = path.join(dataDir(), "prices.sqlite");
    const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    for (const name of Object.keys(TABLES)) {
      db.run(createTableDdl("sqlite", name));
      const have = new Set((db.exec(`PRAGMA table_info(${name})`)[0]?.values ?? []).map((v) => String(v[1])));
      for (const c of TABLES[name].cols) if (!have.has(c[0])) db.run(addColumnDdl("sqlite", name, c));
    }
    return db;
  })();
  return sqliteP;
}
export function persist(db: Database) { fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(path.join(dataDir(), "prices.sqlite"), Buffer.from(db.export())); }

const sqliteBackend: Backend = {
  kind: "sqlite",
  async query(sql, params) { const db = await getDb(); const r = db.exec(sql, params)[0]; if (!r) return []; return r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))); },
  async run(sql, params) { const db = await getDb(); db.run(sql, params); persist(db); },
  async runMany(sql, rows) { const db = await getDb(); const st = db.prepare(sql); db.run("BEGIN"); for (const r of rows) st.run(r); db.run("COMMIT"); st.free(); persist(db); },
};

let pgP: Promise<import("pg").Pool> | null = null;
/** Postgres pool; the schema is auto-migrated (CREATE TABLE / ADD COLUMN IF NOT EXISTS) on first use. */
export function getPool() {
  if (!pgP) pgP = (async () => {
    const { Pool } = (await import("pg")).default ?? (await import("pg"));
    const url = process.env.DATABASE_URL!;
    const local = /@(localhost|127\.0\.0\.1|dpg-[a-z0-9]+-a)(:|\/)/.test(url); // Render internal hosts don't use TLS
    const pool = new Pool({ connectionString: url, max: 5, ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false } });
    for (const name of Object.keys(TABLES)) {
      await pool.query(createTableDdl("pg", name));
      for (const c of TABLES[name].cols) if (c[1] !== "SERIAL") await pool.query(addColumnDdl("pg", name, c));
    }
    return pool;
  })().catch((e) => { pgP = null; throw e; });
  return pgP;
}
const pgBackend: Backend = {
  kind: "postgres",
  async query(sql, params) { return (await (await getPool()).query(toPg(sql), params)).rows; },
  async run(sql, params) { await (await getPool()).query(toPg(sql), params); },
  async runMany(sql, rows) {
    const c = await (await getPool()).connect(); const q = toPg(sql);
    try { await c.query("BEGIN"); for (const r of rows) await c.query(q, r); await c.query("COMMIT"); } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  },
};
export const backend = (): Backend => (usingPostgres() ? pgBackend : sqliteBackend);

export async function query(sql: string, params: Param[] = []) { return backend().query(sql, params); }
export async function run(sql: string, params: Param[] = []) { return backend().run(sql, params); }

export async function saveSnapshots(productId: string, pts: PricePoint[]) {
  await backend().runMany("INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?)", pts.map((p) => [productId, p.retailer, p.date, p.price]));
}
export async function hasHistory(productId: string) {
  return Number((await query("SELECT COUNT(*) AS n FROM snapshots WHERE product_id = ?", [productId]))[0]?.n ?? 0) > 0;
}
export async function getHistory(productId: string, sinceDate?: string): Promise<PricePoint[]> {
  return (await query("SELECT date, retailer, price FROM snapshots WHERE product_id = ? AND date >= ? ORDER BY date", [productId, sinceDate ?? "0000"]))
    .map((r) => ({ date: String(r.date), retailer: String(r.retailer), price: Number(r.price) }));
}
export async function recordOrder(id: string, productId: string, retailer: string, amount: number, status: string) {
  await run("INSERT OR REPLACE INTO orders VALUES (?,?,?,?,?,?)", [id, productId, retailer, amount, status, new Date().toISOString()]);
}
export async function getSimFactor(productId: string) { return Number((await query("SELECT factor FROM sim_drops WHERE product_id = ?", [productId]))[0]?.factor ?? 1); }

export function parseWatchOpts(raw: unknown): WatchOpts {
  if (!raw) return {};
  try { return typeof raw === "string" ? JSON.parse(raw) : (raw as WatchOpts); } catch { return {}; }
}
export function serializeWatchOpts(opts: WatchOpts): string { return JSON.stringify(opts ?? {}); }
