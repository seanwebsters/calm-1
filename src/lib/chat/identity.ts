/**
 * Anonymous identity for the public test chat (/chat): a signed, httpOnly
 * cookie holding the tester's user id. No account, phone number or name.
 * Test-chat users are stored as simulator users so they never mix with
 * production WhatsApp metrics.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "../db";
import type { UserRow } from "../db/types";
import { env } from "../env";
import { createSimulatorUser } from "../users/service";

export const CHAT_COOKIE = "calm1_chat";

function secret() {
  return env.sessionSecret || "calm-1-test-chat-identity";
}

const sign = (id: string) => `${id}.${createHmac("sha256", secret()).update(id).digest("base64url")}`;

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const [id, mac] = token.split(".");
  if (!id || !mac) return null;
  const expected = Buffer.from(sign(id).split(".")[1]!);
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export async function currentChatUser(): Promise<UserRow | null> {
  const id = verify((await cookies()).get(CHAT_COOKIE)?.value);
  if (!id) return null;
  const u = await db().get("users", id);
  return u && u.channel === "simulator" ? u : null;
}

export async function getOrCreateChatUser(): Promise<UserRow> {
  const existing = await currentChatUser();
  if (existing) return existing;
  const u = await createSimulatorUser({ label: "Web test chat", countryCode: "44", timezone: "Europe/London" });
  (await cookies()).set(CHAT_COOKIE, sign(u.id), { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", maxAge: 60 * 60 * 24 * 90 });
  return u;
}

export async function clearChatCookie() {
  (await cookies()).delete(CHAT_COOKIE);
}
