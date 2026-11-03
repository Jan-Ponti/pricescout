import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "ps_vid"; const HEADER = "x-visitor-id";
const valid = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);

/** Give every browser an anonymous visitor id (httpOnly cookie) and forward it to route handlers as a trusted header. */
export function middleware(req: NextRequest) {
  const existing = req.cookies.get(COOKIE)?.value;
  const id = valid(existing) ? existing : crypto.randomUUID().replace(/-/g, "");
  const headers = new Headers(req.headers);
  headers.set(HEADER, id); // always overwrite: clients can't spoof the header
  const res = NextResponse.next({ request: { headers } });
  if (id !== existing) res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|manifest).*)"] };
