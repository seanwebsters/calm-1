/**
 * Demo data for presenting the dashboard before launch. Every row belongs
 * to `channel = "demo"` users, so it never mixes with production metrics,
 * and every screen labels it "Demo data". Content is synthetic.
 */
import { db } from "../db";
import type { CheckinKind, MessageRow, Severity } from "../db/types";
import { seal } from "../crypto";
import { anonId, uuid } from "../ids";
import { estimateCostUsd } from "../llm/pricing";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const OPENERS = ["I'm feeling really overwhelmed today.", "Can't sleep again", "Work was a lot today", "Morning", "Had a good day actually", "Feeling a bit anxious about tomorrow", "Can we do some breathing?", "I've got a big interview on Friday", "Just want to switch off for a bit", "Thanks for yesterday"];
const REPLIES = ["Sounds like you've got a lot on your mind. Want to talk it through, or switch off for a minute?", "Okay. We don't need to solve everything right now. Want to try something small together?", "That's good to hear. What made it feel good?", "Morning. How's today looking?", "Let's slow things down. Breathe in for 4… and out for 6.", "Makes sense you'd feel that way before something big. What part feels heaviest?"];

export async function clearDemo() {
  const store = db();
  const users = await store.find("users", { where: { channel: "demo" }, columns: ["id"] });
  const tables = ["tool_invocations", "memory_events", "memories", "journal_entries", "messages", "conversations", "checkin_deliveries", "checkin_schedules", "checkin_preferences", "user_consents", "user_preferences"] as const;
  for (const u of users) {
    for (const t of tables) await store.removeWhere(t, { user_id: u.id } as never);
    await store.remove("users", u.id);
  }
  for (const t of ["safety_events", "usage_events", "api_costs"] as const) await store.removeWhere(t, { channel: "demo" } as never);
  return users.length;
}

export async function seedDemo(opts: { users?: number; days?: number; seed?: number } = {}) {
  const store = db();
  await clearDemo();
  const R = rng(opts.seed ?? 42);
  const nUsers = opts.users ?? 140;
  const days = opts.days ?? 60;
  const now = Date.now();
  const DAY = 86400_000;
  const kinds: CheckinKind[] = ["morning", "evening", "bedtime"];
  const tools = ["breathing_exercise", "grounding_exercise", "sleep_support", "reflection_prompt", "search_calm_content"];
  // Weighted towards ordinary distress; imminent-risk events are rare.
  const sevs: Severity[] = ["moderate", "moderate", "moderate", "moderate", "low", "low", "moderate", "high", "high", "critical"];
  const cats = ["acute_distress", "acute_distress", "acute_distress", "medication_advice", "diagnosis_request", "diagnosis_request", "acute_distress", "suicidal_ideation", "abuse", "suicide_imminent"];

  for (let i = 0; i < nUsers; i++) {
    // Sign-ups grow over time.
    const joinedAgo = Math.floor(days * Math.pow(R(), 0.7));
    const joined = now - joinedAgo * DAY - Math.floor(R() * DAY);
    const userId = uuid();
    const engaged = R();
    const memory = R() < 0.55;
    const optedOut = R() < 0.06;
    await store.insert("users", {
      id: userId,
      anon_id: anonId("demo"),
      channel: "demo",
      phone_hash: null,
      phone_enc: null,
      phone_last4: null,
      country_code: "44",
      test_label: null,
      language: "en",
      timezone: "Europe/London",
      status: optedOut ? "opted_out" : "active",
      onboarding_step: "done",
      message_count: 0,
      created_at: new Date(joined).toISOString(),
      last_active_at: null,
      last_inbound_at: null,
      deleted_at: null,
    });
    await store.insert("user_preferences", { id: uuid(), user_id: userId, memory_enabled: memory, journal_enabled: R() < 0.2, voice_replies: false, conversation_style: null, updated_at: new Date(joined).toISOString() });
    await store.insert("user_consents", { id: uuid(), user_id: userId, kind: "privacy_notice", granted: true, notice_version: "2026-10", source: "demo", created_at: new Date(joined + 60_000).toISOString() });
    await store.insert("usage_events", { id: uuid(), user_id: userId, channel: "demo", kind: "opted_in", meta: { memory }, created_at: new Date(joined + 60_000).toISOString() });
    if (R() < 0.3) {
      const kind = kinds[Math.floor(R() * 3)]!;
      const prefId = uuid();
      await store.insert("checkin_preferences", { id: prefId, user_id: userId, kind, local_time: kind === "morning" ? "08:30" : kind === "evening" ? "18:30" : "21:45", timezone: "Europe/London", frequency: R() < 0.7 ? "daily" : "weekdays", weekday: null, paused: R() < 0.1, enabled: !optedOut, created_at: new Date(joined + DAY).toISOString(), updated_at: new Date(joined + DAY).toISOString() });
      await store.insert("usage_events", { id: uuid(), user_id: userId, channel: "demo", kind: "checkin_opt_in", meta: { kind }, created_at: new Date(joined + DAY).toISOString() });
      for (let d = 2; d < Math.min(joinedAgo, 30); d += 1 + Math.floor(R() * 3)) {
        const at = now - d * DAY;
        const status = R() < 0.05 ? "failed" : R() < 0.6 ? "read" : "delivered";
        await store.insert("checkin_deliveries", { id: uuid(), user_id: userId, preference_id: prefId, template_name: null, mode: R() < 0.5 ? "template" : "session", status, wa_message_id: null, error: status === "failed" ? "Message undeliverable" : null, scheduled_for: new Date(at).toISOString(), sent_at: new Date(at).toISOString(), replied_at: status === "read" && R() < 0.5 ? new Date(at + 3600_000).toISOString() : null, created_at: new Date(at).toISOString() });
      }
      if (R() < 0.12) await store.insert("usage_events", { id: uuid(), user_id: userId, channel: "demo", kind: "checkin_opt_out", meta: {}, created_at: new Date(now - Math.floor(R() * 20) * DAY).toISOString() });
    }

    // Sessions: engaged users come back more often.
    let total = 0;
    let lastActive = joined;
    const sessions = Math.max(1, Math.round(engaged * engaged * 18));
    for (let s = 0; s < sessions; s++) {
      const start = joined + Math.floor(R() * Math.max(1, joinedAgo) * DAY);
      if (start > now) continue;
      const turns = 1 + Math.floor(R() * 6);
      const convId = uuid();
      let sev: Severity = "none";
      const rows: MessageRow[] = [];
      let t = start;
      for (let k = 0; k < turns; k++) {
        const seq = rows.length + 1;
        const inText = k === 0 ? OPENERS[Math.floor(R() * OPENERS.length)]! : "Yeah, that helps a bit";
        rows.push({ id: uuid(), conversation_id: convId, user_id: userId, seq, direction: "inbound", kind: "text", content_enc: seal(inText), wa_message_id: null, status: "received", latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, safety_severity: "none", error: null, sent_at: new Date(t).toISOString(), created_at: new Date(t).toISOString() });
        const latency = 1800 + Math.floor(R() * 3200);
        t += latency;
        const inTok = 2400 + Math.floor(R() * 1800);
        const outTok = 180 + Math.floor(R() * 260);
        rows.push({ id: uuid(), conversation_id: convId, user_id: userId, seq: seq + 1, direction: "outbound", kind: "text", content_enc: seal(REPLIES[Math.floor(R() * REPLIES.length)]!), wa_message_id: null, status: R() < 0.98 ? "read" : "failed", latency_ms: latency, input_tokens: inTok, output_tokens: outTok, model: "claude-opus-5-5", prompt_version: 1, safety_severity: "none", error: null, sent_at: new Date(t).toISOString(), created_at: new Date(t).toISOString() });
        const cacheRead = Math.floor(inTok * 0.7);
        await store.insert("api_costs", { id: uuid(), provider: "anthropic", model: "claude-opus-5-5", purpose: "reply", channel: "demo", conversation_id: convId, user_id: userId, input_tokens: inTok - cacheRead, output_tokens: outTok, cache_read_tokens: cacheRead, cache_write_tokens: 0, cost_usd: Number(estimateCostUsd("claude-opus-5-5", { input: inTok - cacheRead, output: outTok, cacheRead, cacheWrite: 0 }).toFixed(6)), estimated: true, latency_ms: latency, created_at: new Date(t).toISOString() });
        if (R() < 0.18) {
          const tool = tools[Math.floor(R() * tools.length)]!;
          await store.insert("tool_invocations", { id: uuid(), conversation_id: convId, message_id: rows[rows.length - 2]!.id, user_id: userId, tool, input: {}, output_summary: tool, status: "ok", latency_ms: 3 + Math.floor(R() * 20), created_at: new Date(t).toISOString() });
        }
        if (R() < 0.03) {
          const j = R() < 0.25 ? 9 - Math.floor(R() * 3) : Math.floor(R() * 7);
          sev = sevs[j]!;
          rows[rows.length - 2]!.safety_severity = sev;
          await store.insert("safety_events", { id: uuid(), user_id: userId, conversation_id: convId, message_id: rows[rows.length - 2]!.id, channel: "demo", category: cats[j]!, severity: sev, layer: "input", rule_id: "demo", action: sev === "moderate" ? "supportive" : "resources", review_status: R() < 0.5 ? "unreviewed" : R() < 0.85 ? "confirmed" : "false_positive", reviewed_by: null, reviewed_at: null, policy_version: "safety-2026.10", created_at: new Date(t).toISOString() });
        }
        t += 60_000 + Math.floor(R() * 600_000);
      }
      for (const r of rows) await store.insert("messages", r);
      for (const r of rows) await store.insert("usage_events", { id: uuid(), user_id: userId, channel: "demo", kind: r.direction === "inbound" ? "message_in" : "message_out", meta: {}, created_at: r.created_at });
      await store.insert("conversations", { id: convId, user_id: userId, channel: "demo", status: now - t < 8 * 3600_000 ? "active" : "closed", started_at: new Date(start).toISOString(), last_message_at: new Date(t).toISOString(), message_count: rows.length, summary_enc: null, summary_upto_seq: 0, model: "claude-opus-5-5", prompt_version: 1, max_severity: sev, had_error: rows.some((r) => r.status === "failed") });
      total += rows.length;
      lastActive = Math.max(lastActive, t);
    }
    if (memory && R() < 0.8) {
      for (const text of ["Likes to be called by their first name", "Finds slow breathing helpful when stressed"].slice(0, 1 + Math.floor(R() * 2))) {
        await store.insert("memories", { id: uuid(), user_id: userId, kind: text.startsWith("Likes") ? "name" : "technique", content_enc: seal(text)!, event_date: null, status: "active", confidence: 0.9, source_message_id: null, created_at: new Date(joined).toISOString(), updated_at: new Date(joined).toISOString(), last_used_at: null, expires_at: null });
      }
    }
    await store.update("users", userId, { message_count: total, last_active_at: new Date(lastActive).toISOString(), last_inbound_at: new Date(lastActive).toISOString() });
  }
  return { users: nUsers };
}
