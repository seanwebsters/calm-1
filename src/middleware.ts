import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session-token";

/**
 * Coarse gate for the dashboard: no valid session → sign-in page. Fine-
 * grained permission checks happen in each page and route handler.
 * The WhatsApp webhook and cron endpoints authenticate themselves.
 */
const PUBLIC = ["/login", "/api/auth/login", "/api/whatsapp/webhook", "/api/twilio/webhook", "/api/twilio/status", "/api/cron/tick", "/api/health/live"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
