import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session-token";

/**
 * Coarse gate for the dashboard: no valid session → sign-in page. Fine-
 * grained permission checks happen in each page and route handler.
 * The WhatsApp webhook and cron endpoints authenticate themselves.
 */
const PUBLIC = ["/calm", "/api/auth/auto", "/chat", "/api/chat", "/manifest.webmanifest", "/login", "/api/auth/login", "/api/whatsapp/webhook", "/api/twilio/webhook", "/api/twilio/status", "/api/cron/tick", "/api/health/live"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // The site root opens the public test chat.
  if (pathname === "/" || PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = req.nextUrl.clone();
  // No passcode configured: skip the sign-in screen entirely.
  const openAccess = process.env.AUTH_PROVIDER?.trim() !== "supabase" && !process.env.ADMIN_PASSCODE?.trim();
  if (openAccess) {
    url.pathname = "/api/auth/auto";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)"],
};
