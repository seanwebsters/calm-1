import { db } from "../db";
import type { UserRow } from "../db/types";
import { open } from "../crypto";
import { AppError } from "../errors";
import { listMemories } from "../memory/service";
import { listPreferences } from "../checkins/service";
import { currentConsents, getPreferences } from "../users/service";

export async function requireSimUser(userId: string): Promise<UserRow> {
  const u = await db().get("users", userId);
  if (!u || u.channel !== "simulator") throw new AppError("Simulator user not found.", 404);
  return u;
}

export async function simulatorState(userId: string) {
  const store = db();
  const user = await requireSimUser(userId);
  const convs = await store.find("conversations", { where: { user_id: userId }, orderBy: "started_at" });
  const messages = await store.find("messages", { where: { user_id: userId }, orderBy: "created_at" });
  const convIndex = new Map(convs.map((c, i) => [c.id, i]));
  const prefs = await getPreferences(userId);
  const consents = await currentConsents(userId);
  return {
    user: { id: user.id, anonId: user.anon_id, label: user.test_label, status: user.status, onboarding: user.onboarding_step, timezone: user.timezone, countryCode: user.country_code },
    messages: messages
      .sort((a, b) => (a.created_at === b.created_at ? a.seq - b.seq : a.created_at.localeCompare(b.created_at)))
      .map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, text: open(m.content_enc), at: m.created_at, latencyMs: m.latency_ms, severity: m.safety_severity, session: convIndex.get(m.conversation_id) ?? 0, error: m.error })),
    memoryEnabled: prefs.memory_enabled,
    memories: await listMemories(userId),
    checkins: await listPreferences(userId),
    consents: Object.fromEntries(Object.entries(consents).map(([k, v]) => [k, v?.granted ?? false])),
  };
}

export async function listSimUsers() {
  const users = await db().find("users", { where: { channel: "simulator" }, orderBy: "created_at", desc: true });
  return users.map((u) => ({ id: u.id, anonId: u.anon_id, label: u.test_label ?? u.anon_id, status: u.status, lastActive: u.last_active_at }));
}
