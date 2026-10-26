import { db } from "../db";
import type { Channel } from "../db/types";
import { displayPhone } from "../users/service";

export async function listUsers(channels: Channel[], q?: string) {
  const store = db();
  let users = await store.find("users", { in: { channel: channels }, orderBy: "created_at", desc: true, limit: 500 });
  if (q) users = users.filter((u) => u.anon_id.toLowerCase().includes(q.toLowerCase()) || (u.phone_last4 ?? "").endsWith(q.replace(/\D/g, "").slice(-4) || "§"));
  const ids = new Set(users.map((u) => u.id));
  const prefs = (await store.find("user_preferences", {})).filter((p) => ids.has(p.user_id));
  const checkins = (await store.find("checkin_preferences", { where: { enabled: true } })).filter((c) => ids.has(c.user_id));
  const failed = (await store.find("messages", { where: { status: "failed" }, gte: { created_at: new Date(Date.now() - 7 * 86400_000).toISOString() }, columns: ["user_id"] })).filter((m) => ids.has(m.user_id));
  const prefBy = new Map(prefs.map((p) => [p.user_id, p]));
  return users.map((u) => {
    const ck = checkins.filter((c) => c.user_id === u.id);
    const windowOpen = !!u.last_inbound_at && Date.now() - new Date(u.last_inbound_at).getTime() < 24 * 3600_000;
    return {
      id: u.id,
      anonId: u.anon_id,
      channel: u.channel,
      phone: displayPhone(u),
      createdAt: u.created_at,
      lastActive: u.last_active_at,
      messages: u.message_count,
      status: u.status,
      optedIn: u.onboarding_step === "done" && u.status !== "opted_out",
      memory: prefBy.get(u.id)?.memory_enabled ?? false,
      journal: prefBy.get(u.id)?.journal_enabled ?? false,
      checkins: ck.map((c) => `${c.kind} ${c.local_time}${c.paused ? " (paused)" : ""}`),
      language: u.language,
      timezone: u.timezone,
      windowOpen,
      failedLast7d: failed.filter((f) => f.user_id === u.id).length,
    };
  });
}

export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number];
