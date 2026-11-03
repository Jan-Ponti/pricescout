/** Shared client fetch helper: checks r.ok, parses JSON safely, and turns network/JSON failures into one friendly error. */
export class ApiError extends Error { constructor(message: string, public status = 0, public body?: unknown) { super(message); this.name = "ApiError"; } }

export const SLOW_MS = 5000;
type SlowListener = (slow: boolean) => void;
const listeners = new Set<SlowListener>(); let pendingSlow = 0;
/** Subscribe to "a request has been running > 5s" (free Render instances sleep when idle). */
export function onSlow(fn: SlowListener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = () => listeners.forEach((l) => l(pendingSlow > 0));

export function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return "I couldn't reach the server. Check your connection and try again.";
    if (e.status >= 500) return `The server hit a snag (${e.status})${e.message && !/^HTTP/.test(e.message) ? `: ${e.message}` : ""}. Please try again.`;
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown; slowMs?: number }): Promise<T> {
  const { json, slowMs = SLOW_MS, ...rest } = init ?? {};
  const opts: RequestInit = json !== undefined ? { method: "POST", ...rest, headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) }, body: JSON.stringify(json) } : rest;
  let slow = false;
  const timer = setTimeout(() => { slow = true; pendingSlow++; emit(); }, slowMs);
  try {
    let r: Response;
    try { r = await fetch(url, opts); } catch { throw new ApiError("network error", 0); }
    const text = await r.text();
    let body: any = null;
    if (text) { try { body = JSON.parse(text); } catch { if (r.ok) throw new ApiError("The server sent an unexpected response.", r.status); } }
    if (!r.ok) throw new ApiError(body?.error ? String(body.error) : `HTTP ${r.status}`, r.status, body);
    return body as T;
  } finally {
    clearTimeout(timer);
    if (slow) { pendingSlow--; emit(); }
  }
}
