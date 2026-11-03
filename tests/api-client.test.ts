import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError, friendlyError, onSlow } from "@/lib/client/api";
const res = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "application/json" } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("api() helper", () => {
  it("returns parsed JSON and posts JSON bodies", async () => {
    const f = vi.fn(async () => res('{"ok":1}')); vi.stubGlobal("fetch", f);
    expect(await api("/x", { json: { a: 1 } })).toEqual({ ok: 1 });
    expect((f.mock.calls[0] as any)[1]).toMatchObject({ method: "POST", body: '{"a":1}' });
  });
  it("throws ApiError with the server's message on non-2xx", async () => {
    vi.stubGlobal("fetch", async () => res('{"error":"unknown product"}', 400));
    await expect(api("/x")).rejects.toMatchObject({ status: 400, message: "unknown product" });
  });
  it("maps network and bad-JSON failures to friendly errors", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    const e = await api("/x").catch((x) => x); expect(e).toBeInstanceOf(ApiError); expect(friendlyError(e)).toMatch(/couldn't reach the server/);
    vi.stubGlobal("fetch", async () => res("<html>502</html>", 502));
    expect(friendlyError(await api("/x").catch((x) => x))).toMatch(/server hit a snag \(502\)/);
    vi.stubGlobal("fetch", async () => res("not json", 200));
    expect(friendlyError(await api("/x").catch((x) => x))).toMatch(/unexpected response/);
  });
  it("signals a slow request after 5s and clears it when done", async () => {
    vi.useFakeTimers(); let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => { resolve = r; }));
    const seen: boolean[] = []; const off = onSlow((s) => seen.push(s));
    const p = api("/slow"); await vi.advanceTimersByTimeAsync(5001); expect(seen).toEqual([true]);
    resolve(res("{}")); await p; expect(seen).toEqual([true, false]); off();
  });
});
