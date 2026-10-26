import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { db, type AdminRole, type AdminUserRow } from "../db";
import { env } from "../env";
import { ForbiddenError, UnauthorizedError } from "../errors";
import { nowIso, uuid } from "../ids";
import { audit } from "./audit";
import { can, type Permission } from "./roles";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession, type SessionPayload } from "./session-token";

export type Admin = SessionPayload;

export async function currentAdmin(): Promise<Admin | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  // Re-check the admin record so deactivation and role changes apply immediately.
  const row = await db().get("admin_users", session.adminId);
  if (!row || !row.active) return null;
  return { ...session, role: row.role, name: row.name };
}

/** For server components: redirect to sign-in, or show a 403 for missing permission. */
export async function requirePage(permission: Permission = "dashboard.view"): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  if (!can(admin.role, permission)) redirect(`/forbidden?need=${encodeURIComponent(permission)}`);
  return admin;
}

/** For route handlers. */
export async function requireApi(permission: Permission = "dashboard.view"): Promise<Admin> {
  const admin = await currentAdmin();
  if (!admin) throw new UnauthorizedError();
  if (!can(admin.role, permission)) throw new ForbiddenError();
  return admin;
}

async function startSession(row: AdminUserRow) {
  await db().update("admin_users", row.id, { last_login_at: nowIso() });
  const token = await signSession({ adminId: row.id, email: row.email, name: row.name, role: row.role });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await audit({ adminId: row.id, email: row.email }, "auth.sign_in");
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Local auth: a shared passcode signs in the built-in owner account. */
export async function signInLocal(passcode: string): Promise<void> {
  if (env.authProvider !== "local") throw new UnauthorizedError("Passcode sign-in is disabled.");
  const expected = env.adminPasscode;
  // With no ADMIN_PASSCODE set, sign-in is open (the dashboard shows a warning).
  if (expected && !timingSafeEqualStr(passcode, expected)) throw new UnauthorizedError("That passcode isn't right.");
  const row = await ensureLocalOwner();
  await startSession(row);
}

export async function ensureLocalOwner(): Promise<AdminUserRow> {
  const store = db();
  const email = "owner@calm-1.local";
  const existing = await store.findOne("admin_users", { where: { email } });
  if (existing) return existing;
  return store.insert("admin_users", {
    id: uuid(),
    auth_user_id: null,
    email,
    name: "Local Owner",
    role: "owner",
    active: true,
    created_at: nowIso(),
    last_login_at: null,
  });
}

/** Supabase Auth: email + password, then map to an active admin_users row. */
export async function signInSupabase(email: string, password: string): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseAnonKey) throw new UnauthorizedError("Supabase Auth is not configured.");
  const sb = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new UnauthorizedError("Email or password is incorrect.");
  const store = db();
  let row = await store.findOne("admin_users", { where: { auth_user_id: data.user.id } });
  if (!row) {
    row = await store.findOne("admin_users", { where: { email: email.toLowerCase() } });
    if (row && !row.auth_user_id) row = await store.update("admin_users", row.id, { auth_user_id: data.user.id });
  }
  if (!row || !row.active) throw new ForbiddenError("This account doesn't have access to Calm-1 Admin.");
  await startSession(row);
}

export async function inviteAdmin(by: Admin, input: { email: string; name: string; role: AdminRole }) {
  const row = await db().insert("admin_users", {
    id: uuid(),
    auth_user_id: null,
    email: input.email.toLowerCase(),
    name: input.name,
    role: input.role,
    active: true,
    created_at: nowIso(),
    last_login_at: null,
  });
  await audit(by, "team.invite", { type: "admin_user", id: row.id }, { meta: { role: input.role } });
  return row;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
