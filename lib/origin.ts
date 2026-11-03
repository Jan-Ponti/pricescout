/** Public origin of the app, safe behind proxies (Render reports req.url as https://localhost:10000).
 * Order: APP_URL env → x-forwarded-proto/x-forwarded-host → host header → req.url origin. */
const first = (v: string | null | undefined) => (v ?? "").split(",")[0].trim();
export function publicOrigin(req?: Request | null): string {
  const env = (process.env.APP_URL || "").trim();
  if (env) { try { return new URL(env).origin; } catch { return env.replace(/\/+$/, ""); } }
  if (!req) return "http://localhost:3000";
  const h = req.headers;
  let reqUrl: URL | null = null; try { reqUrl = new URL(req.url); } catch {}
  const fHost = first(h.get("x-forwarded-host"));
  const fProto = first(h.get("x-forwarded-proto")).replace(/:$/, "");
  if (fHost) return `${fProto || reqUrl?.protocol.replace(/:$/, "") || "https"}://${fHost}`;
  const host = first(h.get("host"));
  if (host) return `${fProto || reqUrl?.protocol.replace(/:$/, "") || "http"}://${host}`;
  return reqUrl?.origin ?? "http://localhost:3000";
}
