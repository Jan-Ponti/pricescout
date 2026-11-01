import { describe, it, expect } from "vitest";
import { toPg, createTableDdl, addColumnDdl, TABLES } from "@/lib/schema";

describe("postgres SQL translation", () => {
  it("numbers placeholders", () => {
    expect(toPg("SELECT * FROM watches WHERE product_id = ? AND target > ?")).toBe("SELECT * FROM watches WHERE product_id = $1 AND target > $2");
  });
  it("turns INSERT OR REPLACE without a column list into an upsert", () => {
    expect(toPg("INSERT OR REPLACE INTO snapshots VALUES (?,?,?,?)")).toBe(
      "INSERT INTO snapshots (product_id, retailer, date, price) VALUES ($1,$2,$3,$4) ON CONFLICT (product_id, retailer, date) DO UPDATE SET price = EXCLUDED.price");
  });
  it("handles explicit columns and literals", () => {
    expect(toPg("INSERT OR REPLACE INTO kv VALUES ('shopper_prefs', ?)")).toBe("INSERT INTO kv (k, v) VALUES ('shopper_prefs', $1) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v");
    expect(toPg("INSERT OR REPLACE INTO watches (product_id, target) VALUES (?,?)")).toMatch(/ON CONFLICT \(product_id\) DO UPDATE SET target = EXCLUDED.target$/);
    expect(toPg("INSERT OR IGNORE INTO kv VALUES (?,?)")).toMatch(/ON CONFLICT \(k\) DO NOTHING$/);
  });
  it("leaves plain inserts alone", () => {
    expect(toPg("INSERT INTO notifications (title) VALUES (?)")).toBe("INSERT INTO notifications (title) VALUES ($1)");
  });
  it("generates dialect DDL", () => {
    expect(createTableDdl("pg", "notifications")).toContain("id SERIAL PRIMARY KEY");
    expect(createTableDdl("sqlite", "notifications")).toContain("AUTOINCREMENT");
    expect(createTableDdl("pg", "snapshots")).toContain("price DOUBLE PRECISION");
    expect(createTableDdl("pg", "snapshots")).toContain("PRIMARY KEY(product_id, retailer, date)");
    expect(addColumnDdl("pg", "watches", ["opts", "TEXT"])).toBe("ALTER TABLE watches ADD COLUMN IF NOT EXISTS opts TEXT");
    expect(Object.keys(TABLES)).toContain("orders");
  });
});
