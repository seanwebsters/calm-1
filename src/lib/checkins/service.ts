/**
 * Proactive check-ins – strictly opt-in.
 *
 * WhatsApp rules we follow:
 *  - Users opt in explicitly (in conversation or via the dashboard on their
 *    behalf at their request); the opt-in is stored in user_consents.
 *  - Inside the 24-hour customer-service window we send a normal message.
 *    Outside it we may only send a Meta-*approved* template; if none is
 *    approved for that check-in type, the delivery fails visibly rather than
 *    sending anything non-compliant.
 *  - STOP / "stop check-ins" removes the opt-in immediately.
 */
import { z } from "zod";
import { db } from "../db";
import type { CheckinKind, CheckinPreferenceRow, MessageTemplateRow, UserRow } from "../db/types";
import { AppError } from "../errors";
import { nowIso, uuid } from "../ids";
import { errorMessage, log } from "../log";
import { getSettings } from "../settings";
import { hasConsent, phoneOf, recordConsent } from "../users/service";
import { OUTSIDE_WINDOW_CODE, WhatsAppApiError, sendTemplate, sendText, whatsappConfigured } from "../whatsapp/client";
import { activeConversation, appendMessage } from "../engine/conversations";
import { inQuietHours, isValidTimezone, localParts, zonedToUtc } from "./time";

export const DEFAULT_CHECKIN_TEXT: Record<CheckinKind, string> = {
  morning: "Morning ☀️ How's today looking?",
  evening: "How's your head feeling after today?",
  bedtime: "Ready to slow things down?",
};

export const DEFAULT_TIMES: Record<CheckinKind, string> = { morning: "08:30", evening: "18:30", bedtime: "21:45" };

export const DEFAULT_TEMPLATES: Omit<MessageTemplateRow, "id" | "updated_at">[] = [
  { name: "calm1_morning_checkin", kind: "morning", language: "en_GB", category: "utility", body: "Morning! This is your Calm-1 check-in. How's today looking? Reply any time, or STOP to turn off check-ins.", meta_status: "draft", meta_template_id: null },
  { name: "calm1_evening_checkin", kind: "evening", language: "en_GB", category: "utility", body: "Hi, it's your Calm-1 evening check-in. How's your head feeling after today? Reply STOP to turn off check-ins.", meta_status: "draft", meta_template_id: null },
  { name: "calm1_bedtime_checkin", kind: "bedtime", language: "en_GB", category: "utility", body: "Your Calm-1 bedtime check-in: ready to slow things down? Reply STOP to turn off check-ins.", meta_status: "draft", meta_template_id: null },
];

export async function ensureTemplates() {
  if ((await db().count("message_templates")) > 0) return;
  for (const t of DEFAULT_TEMPLATES) await db().insert("message_templates", { ...t, id: uuid(), updated_at: nowIso() });
}

export const SubscribeInput = z.object({
  kind: z.enum(["morning", "evening", "bedtime"]),
  local_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)").optional(),
  frequency: z.enum(["daily", "weekdays", "weekly"]).default("daily"),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  timezone: z.string().optional(),
});

/** Next run strictly after `from`, honouring frequency. */
export function nextRunAt(pref: Pick<CheckinPreferenceRow, "local_time" | "timezone" | "frequency" | "weekday">, from: Date): Date {
  const [h, m] = pref.local_time.split(":").map(Number) as [number, number];
  const today = localParts(from, pref.timezone);
  for (let i = 0; i < 9; i++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + i, 12));
    const wd = d.getUTCDay();
    if (pref.frequency === "weekdays" && (wd === 0 || wd === 6)) continue;
    if (pref.frequency === "weekly" && wd !== (pref.weekday ?? 1)) continue;
    const at = zonedToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, m, pref.timezone);
    if (at.getTime() > from.getTime()) return at;
  }
  throw new Error("Could not compute next check-in time");
}

async function upsertSchedule(pref: CheckinPreferenceRow) {
  const store = db();
  const next = nextRunAt(pref, new Date()).toISOString();
  const existing = await store.findOne("checkin_schedules", { where: { preference_id: pref.id } });
  if (existing) await store.update("checkin_schedules", existing.id, { next_run_at: next });
  else await store.insert("checkin_schedules", { id: uuid(), preference_id: pref.id, user_id: pref.user_id, next_run_at: next, last_run_at: null });
}

export async function subscribe(user: UserRow, input: z.input<typeof SubscribeInput>, source: "whatsapp" | "simulator" | "admin") {
  const v = SubscribeInput.parse(input);
  const settings = await getSettings();
  const tz = v.timezone && isValidTimezone(v.timezone) ? v.timezone : user.timezone;
  const time = v.local_time ?? DEFAULT_TIMES[v.kind];
  if (inQuietHours(time, settings.checkins.quietHoursStart, settings.checkins.quietHoursEnd)) {
    throw new AppError(`Check-ins can't be scheduled during quiet hours (${settings.checkins.quietHoursStart}–${settings.checkins.quietHoursEnd}).`);
  }
  const store = db();
  const existing = await store.findOne("checkin_preferences", { where: { user_id: user.id, kind: v.kind } });
  const fields = { local_time: time, timezone: tz, frequency: v.frequency, weekday: v.frequency === "weekly" ? (v.weekday ?? 1) : null, paused: false, enabled: true, updated_at: nowIso() };
  const pref = existing ? (await store.update("checkin_preferences", existing.id, fields))! : await store.insert("checkin_preferences", { id: uuid(), user_id: user.id, kind: v.kind, created_at: nowIso(), ...fields });
  await recordConsent(user.id, "checkins", true, settings.privacy.noticeVersion, source);
  await upsertSchedule(pref);
  await store.insert("usage_events", { id: uuid(), user_id: user.id, channel: user.channel, kind: "checkin_opt_in", meta: { kind: v.kind, frequency: v.frequency }, created_at: nowIso() });
  return pref;
}

export async function setPaused(userId: string, paused: boolean, kind?: CheckinKind) {
  const store = db();
  const prefs = await store.find("checkin_preferences", { where: { user_id: userId, ...(kind ? { kind } : {}) } });
  for (const p of prefs) {
    await store.update("checkin_preferences", p.id, { paused, updated_at: nowIso() });
    if (!paused) await upsertSchedule({ ...p, paused });
  }
  return prefs.length;
}

export async function unsubscribe(user: UserRow, source: "whatsapp" | "simulator" | "admin", kind?: CheckinKind) {
  const store = db();
  const prefs = await store.find("checkin_preferences", { where: { user_id: user.id, ...(kind ? { kind } : {}) } });
  for (const p of prefs) {
    await store.update("checkin_preferences", p.id, { enabled: false, updated_at: nowIso() });
    await store.removeWhere("checkin_schedules", { preference_id: p.id });
  }
  const stillEnabled = await store.count("checkin_preferences", { where: { user_id: user.id, enabled: true } });
  if (!stillEnabled && prefs.length) {
    const settings = await getSettings();
    await recordConsent(user.id, "checkins", false, settings.privacy.noticeVersion, source);
    await store.insert("usage_events", { id: uuid(), user_id: user.id, channel: user.channel, kind: "checkin_opt_out", meta: { kind: kind ?? "all" }, created_at: nowIso() });
  }
  return prefs.length;
}

export async function listPreferences(userId: string) {
  return db().find("checkin_preferences", { where: { user_id: userId, enabled: true } });
}

/** Send every due check-in. Called by the worker tick. */
export async function runDueCheckins(now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const settings = await getSettings();
  const store = db();
  const due = await store.find("checkin_schedules", { lt: { next_run_at: new Date(now.getTime() + 1000).toISOString() }, limit: 200 });
  const stats = { sent: 0, skipped: 0, failed: 0 };
  for (const sched of due) {
    const pref = await store.get("checkin_preferences", sched.preference_id);
    const user = await store.get("users", sched.user_id);
    // Advance first so a crash mid-send never double-sends.
    if (pref) await store.update("checkin_schedules", sched.id, { next_run_at: nextRunAt(pref, now).toISOString(), last_run_at: now.toISOString() });
    if (!pref || !user) {
      await store.remove("checkin_schedules", sched.id);
      continue;
    }
    const result = await deliver(user, pref, sched.next_run_at, settings.checkins, now);
    stats[result]++;
  }
  return stats;
}

async function deliver(
  user: UserRow,
  pref: CheckinPreferenceRow,
  scheduledFor: string,
  cfg: { enabled: boolean; maxPerWeek: number },
  now: Date,
): Promise<"sent" | "skipped" | "failed"> {
  const store = db();
  const base = { id: uuid(), user_id: user.id, preference_id: pref.id, wa_message_id: null, scheduled_for: scheduledFor, sent_at: null, replied_at: null, created_at: nowIso() };
  const skip = async (reason: string) => {
    await store.insert("checkin_deliveries", { ...base, template_name: null, mode: user.channel === "whatsapp" ? "session" : "simulator", status: "skipped", error: reason });
    return "skipped" as const;
  };
  if (!cfg.enabled) return skip("Check-ins are switched off in settings");
  if (!pref.enabled || pref.paused) return skip("Paused by user");
  if (user.status !== "active") return skip(`User status ${user.status}`);
  if (!(await hasConsent(user.id, "checkins"))) return skip("No check-in consent on record");
  const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const sentThisWeek = await store.count("checkin_deliveries", { where: { user_id: user.id }, in: { status: ["sent", "delivered", "read"] }, gte: { created_at: weekAgo } });
  if (sentThisWeek >= cfg.maxPerWeek) return skip("Weekly check-in limit reached");

  const text = DEFAULT_CHECKIN_TEXT[pref.kind];
  const conv = await activeConversation(user, user.channel);

  if (user.channel !== "whatsapp") {
    await appendMessage(conv, { direction: "outbound", kind: "text", text, wa_message_id: null, status: "delivered", latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, safety_severity: "none", error: null });
    await store.insert("checkin_deliveries", { ...base, template_name: null, mode: "simulator", status: "delivered", error: null, sent_at: nowIso() });
    return "sent";
  }

  const phone = phoneOf(user);
  if (!phone || !whatsappConfigured()) {
    await store.insert("checkin_deliveries", { ...base, template_name: null, mode: "session", status: "failed", error: "WhatsApp is not configured" });
    return "failed";
  }
  const insideWindow = !!user.last_inbound_at && now.getTime() - new Date(user.last_inbound_at).getTime() < 24 * 3600_000 - 5 * 60_000;
  try {
    if (insideWindow) {
      const [id] = await sendText(phone, text);
      await appendMessage(conv, { direction: "outbound", kind: "text", text, wa_message_id: id ?? null, status: "sent", latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, safety_severity: "none", error: null });
      await store.insert("checkin_deliveries", { ...base, template_name: null, mode: "session", status: "sent", wa_message_id: id ?? null, error: null, sent_at: nowIso() });
      return "sent";
    }
    const template = await store.findOne("message_templates", { where: { kind: pref.kind, meta_status: "approved" } });
    if (!template) {
      await store.insert("checkin_deliveries", { ...base, template_name: null, mode: "template", status: "failed", error: "Outside the 24h window and no approved template for this check-in" });
      return "failed";
    }
    const id = await sendTemplate(phone, template.name, template.language);
    await appendMessage(conv, { direction: "outbound", kind: "template", text: template.body, wa_message_id: id, status: "sent", latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, safety_severity: "none", error: null });
    await store.insert("checkin_deliveries", { ...base, template_name: template.name, mode: "template", status: "sent", wa_message_id: id, error: null, sent_at: nowIso() });
    return "sent";
  } catch (e) {
    const msg = e instanceof WhatsAppApiError && e.code === OUTSIDE_WINDOW_CODE ? "Meta rejected: outside 24h window" : errorMessage(e);
    log.warn("check-in delivery failed", { userAnon: user.anon_id, error: msg });
    await store.insert("checkin_deliveries", { ...base, template_name: null, mode: insideWindow ? "session" : "template", status: "failed", error: msg });
    return "failed";
  }
}

/** Link a user's reply to their most recent check-in (for reply-rate stats). */
export async function markCheckinReplied(userId: string) {
  const store = db();
  const [last] = await store.find("checkin_deliveries", { where: { user_id: userId, replied_at: null }, in: { status: ["sent", "delivered", "read"] }, orderBy: "created_at", desc: true, limit: 1 });
  if (last && Date.now() - new Date(last.created_at).getTime() < 12 * 3600_000) await store.update("checkin_deliveries", last.id, { replied_at: nowIso() });
}
