/** Single source of truth for the schema. Both the SQLite (sql.js) and Postgres backends generate DDL from this. */
export type ColType = "TEXT" | "REAL" | "INTEGER" | "SERIAL";
export interface TableDef { cols: Array<[string, ColType, string?]>; pk: string[] }
export const TABLES: Record<string, TableDef> = {
  snapshots: { cols: [["product_id", "TEXT"], ["retailer", "TEXT"], ["date", "TEXT"], ["price", "REAL"]], pk: ["product_id", "retailer", "date"] },
  watches: { cols: [["visitor", "TEXT", "DEFAULT 'default'"], ["product_id", "TEXT"], ["target", "REAL"], ["last_price", "REAL"], ["created", "TEXT"], ["opts", "TEXT"]], pk: ["visitor", "product_id"] },
  push_subs: { cols: [["endpoint", "TEXT"], ["json", "TEXT"], ["visitor", "TEXT", "DEFAULT 'default'"]], pk: ["endpoint"] },
  notifications: { cols: [["id", "SERIAL"], ["product_id", "TEXT"], ["title", "TEXT"], ["body", "TEXT"], ["url", "TEXT"], ["created", "TEXT"], ["read", "INTEGER", "DEFAULT 0"], ["visitor", "TEXT", "DEFAULT 'default'"]], pk: ["id"] },
  sim_drops: { cols: [["visitor", "TEXT", "DEFAULT 'default'"], ["product_id", "TEXT"], ["factor", "REAL"]], pk: ["visitor", "product_id"] },
  kv: { cols: [["k", "TEXT"], ["v", "TEXT"]], pk: ["k"] },
  purchases: { cols: [["id", "TEXT"], ["order_id", "TEXT"], ["product_id", "TEXT"], ["product_name", "TEXT"], ["retailer", "TEXT"], ["amount", "REAL"], ["status", "TEXT"], ["mode", "TEXT"], ["source", "TEXT"], ["approve_url", "TEXT"], ["note", "TEXT"], ["created", "TEXT"], ["updated", "TEXT"], ["visitor", "TEXT", "DEFAULT 'default'"]], pk: ["id"] },
  orders: { cols: [["id", "TEXT"], ["product_id", "TEXT"], ["retailer", "TEXT"], ["amount", "REAL"], ["status", "TEXT"], ["created", "TEXT"], ["visitor", "TEXT", "DEFAULT 'default'"]], pk: ["id"] },
};

function colDdl(dialect: "sqlite" | "pg", [name, type, extra]: [string, ColType, string?], singlePk: boolean) {
  if (type === "SERIAL") return dialect === "pg" ? `${name} SERIAL PRIMARY KEY` : `${name} INTEGER PRIMARY KEY AUTOINCREMENT`;
  const t = dialect === "pg" && type === "REAL" ? "DOUBLE PRECISION" : type;
  return `${name} ${t}${singlePk ? " PRIMARY KEY" : ""}${extra ? " " + extra : ""}`;
}
/** CREATE TABLE statements (columns added later are created via addColumnDdl so old DBs migrate). */
export function createTableDdl(dialect: "sqlite" | "pg", name: string, t = TABLES[name], as = name) {
  const single = t.pk.length === 1;
  const cols = t.cols.map((c) => colDdl(dialect, c, single && c[0] === t.pk[0] && c[1] !== "SERIAL"));
  if (!single) cols.push(`PRIMARY KEY(${t.pk.join(", ")})`);
  return `CREATE TABLE IF NOT EXISTS ${as} (${cols.join(", ")})`;
}
export function addColumnDdl(dialect: "sqlite" | "pg", table: string, col: [string, ColType, string?]) {
  const def = colDdl(dialect, col, false);
  return dialect === "pg" ? `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${def}` : `ALTER TABLE ${table} ADD COLUMN ${def}`;
}

/** Translate the SQLite-flavoured SQL used across the app into Postgres SQL. */
export function toPg(sql: string): string {
  let i = 0;
  let out = sql.replace(/\?/g, () => `$${++i}`);
  const m = out.match(/^\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+(\w+)\s*(\(([^)]*)\))?\s*VALUES\s*([\s\S]*)$/i);
  if (!m) return out;
  const [, mode, table, , colList, rest] = m;
  const t = TABLES[table]; if (!t) throw new Error(`toPg: unknown table ${table}`);
  const cols = colList ? colList.split(",").map((s) => s.trim()) : t.cols.map((c) => c[0]);
  const values = rest.trim().replace(/;$/, "");
  const conflict = `ON CONFLICT (${t.pk.join(", ")})`;
  const upd = cols.filter((c) => !t.pk.includes(c));
  const tail = mode.toUpperCase() === "IGNORE" || !upd.length ? `${conflict} DO NOTHING` : `${conflict} DO UPDATE SET ${upd.map((c) => `${c} = EXCLUDED.${c}`).join(", ")}`;
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values} ${tail}`;
}

/** Tables whose primary key gained the visitor column. Old copies must be rebuilt (a PK can't be altered in place on SQLite). */
export const needsRebuild = (name: string, have: Set<string>) => TABLES[name].pk.includes("visitor") && have.size > 0 && !have.has("visitor");
/** Statements that rebuild a pre-visitor table, assigning every existing row to the default visitor. Works on SQLite and Postgres. */
export function rebuildDdl(dialect: "sqlite" | "pg", name: string, have: Set<string>): string[] {
  const tmp = `${name}__v2`;
  const cols = TABLES[name].cols.map((c) => c[0]).filter((c) => c === "visitor" || have.has(c));
  const sel = cols.map((c) => (c === "visitor" ? "'default'" : c));
  return [`DROP TABLE IF EXISTS ${tmp}`, createTableDdl(dialect, name, TABLES[name], tmp),
    `INSERT INTO ${tmp} (${cols.join(", ")}) SELECT ${sel.join(", ")} FROM ${name}`, `DROP TABLE ${name}`, `ALTER TABLE ${tmp} RENAME TO ${name}`];
}
