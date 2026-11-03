import { AsyncLocalStorage } from "node:async_hooks";

/** Anonymous per-browser identity. Set as an httpOnly cookie by middleware.ts and forwarded as a request header. */
export const VISITOR_COOKIE = "ps_vid";
export const VISITOR_HEADER = "x-visitor-id";
/** Rows that existed before per-visitor scoping (and CLI/tests without a request) belong to this visitor. */
export const DEFAULT_VISITOR = "default";
export const validVisitorId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);

const als = new AsyncLocalStorage<string>();
/** Run fn as a specific visitor (cron loops, public share pages, tests). */
export function withVisitor<T>(visitor: string, fn: () => T): T { return als.run(visitor, fn); }

/** The visitor for the current request: explicit context > forwarded header > default. */
export function currentVisitor(): string {
  const v = als.getStore();
  if (v) return v;
  try {
    const { headers } = require("next/headers") as typeof import("next/headers");
    const h = headers().get(VISITOR_HEADER);
    if (validVisitorId(h)) return h;
  } catch { /* not inside a Next request (tests, scripts) */ }
  return DEFAULT_VISITOR;
}
/** Per-visitor kv key. The default visitor keeps the legacy unprefixed keys, so existing data needs no kv migration. */
export function vk(key: string, visitor = currentVisitor()): string { return visitor === DEFAULT_VISITOR ? key : `v:${visitor}:${key}`; }
