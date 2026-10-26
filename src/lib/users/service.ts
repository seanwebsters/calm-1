import { db, DuplicateError } from "../db";
import type { Channel, ConsentKind, UserConsentRow, UserPreferencesRow, UserRow } from "../db/types";
import { maskPhone, normalisePhone, open, phoneHash, seal } from "../crypto";
import { anonId, nowIso, uuid } from "../ids";

/** Dialling codes we recognise for localising support resources (longest first). */
const COUNTRY_CODES = ["353", "61", "44", "1"];

export function countryCodeOf(phone: string): string | null {
  const d = normalisePhone(phone);
  return COUNTRY_CODES.find((c) => d.startsWith(c)) ?? null;
}

const TZ_BY_COUNTRY: Record<string, string> = { "44": "Europe/London", "353": "Europe/Dublin", "1": "America/New_York", "61": "Australia/Sydney" };

async function createPreferences(userId: string) {
  await db().insert("user_preferences", {
    id: uuid(),
    user_id: userId,
    memory_enabled: false,
    journal_enabled: false,
    voice_replies: false,
    conversation_style: null,
    updated_at: nowIso(),
  });
}

export async function findOrCreateWhatsappUser(phone: string): Promise<{ user: UserRow; created: boolean }> {
  const store = db();
  const hash = phoneHash(phone);
  const existing = await store.findOne("users", { where: { phone_hash: hash } });
  if (existing && existing.status !== "deleted") return { user: existing, created: false };
  const cc = countryCodeOf(phone);
  const digits = normalisePhone(phone);
  const row: UserRow = {
    id: uuid(),
    anon_id: anonId(),
    channel: "whatsapp",
    phone_hash: hash,
    phone_enc: seal(digits),
    phone_last4: digits.slice(-4),
    country_code: cc,
    test_label: null,
    language: "en",
    timezone: (cc && TZ_BY_COUNTRY[cc]) || "Europe/London",
    status: "onboarding",
    onboarding_step: "new",
    message_count: 0,
    created_at: nowIso(),
    last_active_at: null,
    last_inbound_at: null,
    deleted_at: null,
  };
  try {
    const user = await store.insert("users", row);
    await createPreferences(user.id);
    return { user, created: true };
  } catch (e) {
    // Two webhook deliveries racing for a brand-new number: use the winner.
    if (e instanceof DuplicateError) {
      const winner = await store.findOne("users", { where: { phone_hash: hash } });
      if (winner) return { user: winner, created: false };
    }
    throw e;
  }
}

export async function createSimulatorUser(opts: { label: string; countryCode?: string | null; timezone?: string; channel?: Channel }): Promise<UserRow> {
  const cc = opts.countryCode ?? "44";
  const user = await db().insert("users", {
    id: uuid(),
    anon_id: anonId(opts.channel === "demo" ? "demo" : "sim"),
    channel: opts.channel ?? "simulator",
    phone_hash: null,
    phone_enc: null,
    phone_last4: null,
    country_code: cc,
    test_label: opts.label,
    language: "en",
    timezone: opts.timezone ?? TZ_BY_COUNTRY[cc ?? ""] ?? "Europe/London",
    status: "onboarding",
    onboarding_step: "new",
    message_count: 0,
    created_at: nowIso(),
    last_active_at: null,
    last_inbound_at: null,
    deleted_at: null,
  });
  await createPreferences(user.id);
  return user;
}

export function phoneOf(user: UserRow): string | null {
  return user.phone_enc ? open(user.phone_enc) : null;
}

export function displayPhone(user: UserRow): string {
  return user.channel === "whatsapp" ? maskPhone(user.phone_last4) : user.channel === "simulator" ? "Simulator" : "Demo";
}

export async function getPreferences(userId: string): Promise<UserPreferencesRow> {
  const p = await db().findOne("user_preferences", { where: { user_id: userId } });
  if (p) return p;
  await createPreferences(userId);
  return (await db().findOne("user_preferences", { where: { user_id: userId } }))!;
}

export async function setPreferences(userId: string, patch: Partial<Pick<UserPreferencesRow, "memory_enabled" | "journal_enabled" | "voice_replies" | "conversation_style">>) {
  const p = await getPreferences(userId);
  return db().update("user_preferences", p.id, { ...patch, updated_at: nowIso() });
}

export async function recordConsent(userId: string, kind: ConsentKind, granted: boolean, noticeVersion: string, source: UserConsentRow["source"]) {
  await db().insert("user_consents", { id: uuid(), user_id: userId, kind, granted, notice_version: noticeVersion, source, created_at: nowIso() });
}

export async function currentConsents(userId: string): Promise<Partial<Record<ConsentKind, UserConsentRow>>> {
  const rows = await db().find("user_consents", { where: { user_id: userId }, orderBy: "created_at" });
  const out: Partial<Record<ConsentKind, UserConsentRow>> = {};
  for (const r of rows) out[r.kind] = r; // later rows win
  return out;
}

export async function hasConsent(userId: string, kind: ConsentKind): Promise<boolean> {
  return (await currentConsents(userId))[kind]?.granted === true;
}

/**
 * Erase a user. Content tables are hard-deleted; aggregate telemetry rows
 * keep no link to the person (user_id cleared). A deletion_requests row with
 * the anonymous id remains as proof of erasure.
 */
export async function deleteUserData(userId: string, via: "whatsapp" | "simulator" | "admin", handledBy: string | null) {
  const store = db();
  const user = await store.get("users", userId);
  if (!user) return null;
  const tables = [
    "tool_invocations",
    "memory_events",
    "memories",
    "journal_entries",
    "messages",
    "conversations",
    "checkin_deliveries",
    "checkin_schedules",
    "checkin_preferences",
    "user_consents",
    "user_preferences",
  ] as const;
  for (const t of tables) await store.removeWhere(t, { user_id: userId } as never);
  for (const t of ["safety_events", "usage_events", "api_costs"] as const) await store.updateWhere(t, { user_id: userId } as never, { user_id: null } as never);
  await store.updateWhere("jobs", { lock_key: `user:${userId}`, status: "queued" }, { status: "dead", last_error: "user deleted" });
  const req = await store.insert("deletion_requests", {
    id: uuid(),
    user_id: null,
    anon_id: user.anon_id,
    status: "completed",
    requested_via: via,
    requested_at: nowIso(),
    completed_at: nowIso(),
    handled_by: handledBy,
  });
  await store.updateWhere("deletion_requests", { user_id: userId }, { user_id: null, status: "completed", completed_at: nowIso() });
  await store.remove("users", userId);
  return req;
}

/** Everything we hold about a user, decrypted, for a subject access request. */
export async function exportUserData(userId: string) {
  const store = db();
  const user = await store.get("users", userId);
  if (!user) return null;
  const [prefs, consents, messages, memories, journal, checkins] = await Promise.all([
    getPreferences(userId),
    store.find("user_consents", { where: { user_id: userId }, orderBy: "created_at" }),
    store.find("messages", { where: { user_id: userId }, orderBy: "created_at" }),
    store.find("memories", { where: { user_id: userId, status: "active" } }),
    store.find("journal_entries", { where: { user_id: userId }, orderBy: "created_at" }),
    store.find("checkin_preferences", { where: { user_id: userId } }),
  ]);
  return {
    exported_at: nowIso(),
    account: { id: user.anon_id, created_at: user.created_at, language: user.language, timezone: user.timezone, status: user.status },
    preferences: { memory_enabled: prefs.memory_enabled, journal_enabled: prefs.journal_enabled, voice_replies: prefs.voice_replies },
    consents: consents.map((c) => ({ kind: c.kind, granted: c.granted, notice_version: c.notice_version, at: c.created_at })),
    messages: messages.map((m) => ({ at: m.created_at, from: m.direction === "inbound" ? "you" : "calm-1", text: open(m.content_enc) })),
    memories: memories.map((m) => ({ kind: m.kind, text: open(m.content_enc), event_date: m.event_date, saved_at: m.created_at })),
    journal: journal.map((j) => ({ at: j.created_at, text: open(j.content_enc) })),
    checkins: checkins.map((c) => ({ kind: c.kind, time: c.local_time, timezone: c.timezone, frequency: c.frequency, paused: c.paused, enabled: c.enabled })),
  };
}
