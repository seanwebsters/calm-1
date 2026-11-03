/**
 * Open-access sign-in: with no ADMIN_PASSCODE (and local auth), visitors go
 * straight into the dashboard without a sign-in screen.
 */
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { signInLocal } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next") ?? "/overview";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/overview";
  if (!env.openAccess) return NextResponse.redirect(new URL("/login", url));
  await signInLocal("");
  return NextResponse.redirect(new URL(safeNext, url));
}
