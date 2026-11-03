import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import initSqlJs from "sql.js";
import { rebuildDdl, needsRebuild } from "@/lib/schema";

// Build a pre-visitor database file (old schema: watches PK = product_id, no visitor columns) before the app opens it.
beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ps-mig-")); process.env.DATA_DIR = dir; delete process.env.DATABASE_URL;
  const SQL = await initSqlJs({ locateFile: (f) => path.join(process.cwd(), "node_modules/sql.js/dist", f) });
  const db = new SQL.Database();
  db.run("CREATE TABLE watches (product_id TEXT PRIMARY KEY, target REAL, last_price REAL, created TEXT, opts TEXT)");
  db.run("INSERT INTO watches VALUES ('kindle-paperwhite', 100, 120, '2026-10-01', '{}')");
  db.run("CREATE TABLE sim_drops (product_id TEXT PRIMARY KEY, factor REAL)");
  db.run("INSERT INTO sim_drops VALUES ('kindle-paperwhite', 0.9)");
  db.run("CREATE TABLE purchases (id TEXT PRIMARY KEY, order_id TEXT, product_id TEXT, product_name TEXT, retailer TEXT, amount REAL, status TEXT, mode TEXT, source TEXT, approve_url TEXT, note TEXT, created TEXT, updated TEXT)");
  db.run("INSERT INTO purchases VALUES ('p1', 'O1', 'kindle-paperwhite', 'Kindle', 'Amazon', 99, 'completed', 'approval', 'checkout', NULL, NULL, '2026-10-02', '2026-10-02')");
  fs.writeFileSync(path.join(dir, "prices.sqlite"), Buffer.from(db.export()));
});

describe("per-visitor schema migration", () => {
  it("rebuilds PK tables and assigns existing rows to the default visitor (SQLite)", async () => {
    const { query, run } = await import("@/lib/db");
    expect(await query("SELECT visitor, product_id, target FROM watches")).toEqual([{ visitor: "default", product_id: "kindle-paperwhite", target: 100 }]);
    expect((await query("SELECT visitor FROM sim_drops"))[0].visitor).toBe("default");
    expect((await query("SELECT visitor FROM purchases WHERE id = 'p1'"))[0].visitor).toBe("default");
    // Two visitors can now watch the same product.
    await run("INSERT INTO watches (visitor, product_id, target) VALUES ('abcdefgh12', 'kindle-paperwhite', 50)");
    expect((await query("SELECT COUNT(*) AS n FROM watches"))[0].n).toBe(2);
  });
  it("generates Postgres-compatible rebuild SQL", () => {
    const have = new Set(["product_id", "target", "last_price", "created", "opts"]);
    expect(needsRebuild("watches", have)).toBe(true);
    expect(needsRebuild("watches", new Set([...have, "visitor"]))).toBe(false);
    expect(needsRebuild("watches", new Set())).toBe(false); // brand-new DB: plain CREATE
    expect(needsRebuild("purchases", new Set(["id"]))).toBe(false); // non-PK tables just ADD COLUMN
    const q = rebuildDdl("pg", "watches", have);
    expect(q[1]).toContain("CREATE TABLE IF NOT EXISTS watches__v2 (visitor TEXT DEFAULT 'default'");
    expect(q[1]).toContain("PRIMARY KEY(visitor, product_id)");
    expect(q[2]).toBe("INSERT INTO watches__v2 (visitor, product_id, target, last_price, created, opts) SELECT 'default', product_id, target, last_price, created, opts FROM watches");
    expect(q.slice(3)).toEqual(["DROP TABLE watches", "ALTER TABLE watches__v2 RENAME TO watches"]);
  });
});
