/**
 * Three-layer memory:
 *  - short-term: recent messages of the active conversation (+ rolling summary)
 *  - long-term: durable, user-approved facts in `memories` (encrypted)
 *  - contextual retrieval: the few memories that matter for this turn
 *
 * Memory is OFF until the user opts in. Extraction runs in the background,
 * applies sensitivity rules, and never stores special-category data.
 */
import { z } from "zod";
import { db } from "../db";
import type { Channel, MemoryKind, MemoryRow, UserRow } from "../db/types";
import { open, seal } from "../crypto";
import { nowIso, uuid } from "../ids";
import { llm, recordCost, textOf } from "../llm";
import { getSettings } from "../settings";
import { localDateString } from "../checkins/time";

export const MAX_MEMORIES_PER_USER = 60;
export const MIN_CONFIDENCE = 0.6;

export interface PlainMemory {
  id: string;
  kind: MemoryKind;
  text: string;
  event_date: string | null;
  created_at: string;
  confidence: number;
}

const toPlain = (m: MemoryRow): PlainMemory => ({ id: m.id, kind: m.kind, text: open(m.content_enc), event_date: m.event_date, created_at: m.created_at, confidence: m.confidence });

export async function listMemories(userId: string): Promise<PlainMemory[]> {
  const rows = await db().find("memories", { where: { user_id: userId, status: "active" }, orderBy: "created_at" });
  const now = Date.now();
  return rows.filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > now).map(toPlain);
}

async function logEvent(userId: string, memoryId: string | null, action: "created" | "updated" | "deleted" | "rejected" | "retrieved", actor: "system" | "user" | "admin", reason: string | null = null) {
  await db().insert("memory_events", { id: uuid(), user_id: userId, memory_id: memoryId, action, actor, reason, created_at: nowIso() });
}

export async function deleteMemory(userId: string, memoryId: string, actor: "user" | "admin" | "system") {
  const m = await db().get("memories", memoryId);
  if (!m || m.user_id !== userId || m.status !== "active") return false;
  // Overwrite the ciphertext as well as flagging, so nothing recoverable remains.
  await db().update("memories", memoryId, { status: "deleted", content_enc: "", updated_at: nowIso() });
  await logEvent(userId, memoryId, "deleted", actor);
  return true;
}

export async function deleteAllMemories(userId: string, actor: "user" | "admin") {
  const rows = await db().find("memories", { where: { user_id: userId, status: "active" } });
  for (const r of rows) await deleteMemory(userId, r.id, actor);
  return rows.length;
}

export async function correctMemory(userId: string, memoryId: string, text: string, actor: "user" | "admin") {
  const m = await db().get("memories", memoryId);
  if (!m || m.user_id !== userId || m.status !== "active") return false;
  await db().update("memories", memoryId, { content_enc: seal(text.trim().slice(0, 300))!, updated_at: nowIso(), confidence: 1 });
  await logEvent(userId, memoryId, "updated", actor, "user correction");
  return true;
}

export async function addMemory(user: UserRow, input: { kind: MemoryKind; text: string; event_date?: string | null; confidence?: number; source_message_id?: string | null }, actor: "system" | "user" = "system") {
  const settings = await getSettings();
  const expires = input.kind === "event" && input.event_date ? new Date(new Date(`${input.event_date}T23:59:59Z`).getTime() + settings.privacy.eventMemoryDays * 86400_000).toISOString() : null;
  const row = await db().insert("memories", {
    id: uuid(),
    user_id: user.id,
    kind: input.kind,
    content_enc: seal(input.text.trim().slice(0, 300))!,
    event_date: input.event_date ?? null,
    status: "active",
    confidence: input.confidence ?? 1,
    source_message_id: input.source_message_id ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    last_used_at: null,
    expires_at: expires,
  });
  await logEvent(user.id, row.id, "created", actor);
  return row;
}

// ---------------------------------------------------------------- extraction

const SENSITIVE = ["none", "health", "sexual_orientation_or_life", "religion", "politics", "ethnicity", "trade_union", "criminal", "genetic_biometric", "third_party_identifying", "financial_identifiers", "location_precise"] as const;

const Candidate = z.object({
  action: z.enum(["create", "update", "none"]),
  existing_id: z.string().nullable(),
  kind: z.enum(["name", "preference", "goal", "style", "technique", "event", "context"]),
  text: z.string().max(300),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confidence: z.number().min(0).max(1),
  sensitive_category: z.enum(SENSITIVE),
});
const ExtractionOutput = z.object({ memories: z.array(Candidate).max(5) });
export type MemoryCandidate = z.infer<typeof Candidate>;

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["memories"],
  properties: {
    memories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "existing_id", "kind", "text", "event_date", "confidence", "sensitive_category"],
        properties: {
          action: { type: "string", enum: ["create", "update", "none"] },
          existing_id: { type: ["string", "null"] },
          kind: { type: "string", enum: ["name", "preference", "goal", "style", "technique", "event", "context"] },
          text: { type: "string" },
          event_date: { type: ["string", "null"] },
          confidence: { type: "number" },
          sensitive_category: { type: "string", enum: [...SENSITIVE] },
        },
      },
    },
  },
};

const EXTRACTION_SYSTEM = `You decide what a wellbeing companion should durably remember about a user, from their latest message.
Save only things that will make future conversations more personal and helpful:
- name: what they like to be called
- preference / style: how they like to be talked to, things they enjoy
- goal: personal goals they're working on
- technique: wellbeing techniques that help them
- event: specific upcoming events with a date (resolve relative dates like "Thursday" against today's date given below; event_date is the day it happens)
- context: stable, low-sensitivity life context (e.g. "works as a nurse on night shifts", "has a dog called Max")
Rules:
- Most messages contain nothing worth saving: return an empty list.
- Write each memory as a short third-person note ("Has a big presentation at work"). No quotes of the user.
- Never save special-category or high-risk information: health conditions, diagnoses, medication, mental-health crises or self-harm, sexuality, religion, politics, ethnicity, criminal matters, precise addresses, financial identifiers, or identifying details about other people. Mark such candidates with the right sensitive_category so they're discarded; prefer rephrasing to keep only the non-sensitive helpful part (e.g. "Finds box breathing helpful when stressed").
- If it updates an existing memory, use action "update" with its id.
- Confidence reflects how clearly the user stated it.`;

export interface ExtractionResult {
  accepted: MemoryCandidate[];
  rejected: { candidate: MemoryCandidate; reason: string }[];
}

export function filterCandidates(cands: MemoryCandidate[], existingIds: Set<string>): ExtractionResult {
  const out: ExtractionResult = { accepted: [], rejected: [] };
  for (const c of cands) {
    if (c.action === "none") continue;
    if (c.sensitive_category !== "none") out.rejected.push({ candidate: c, reason: `sensitive: ${c.sensitive_category}` });
    else if (c.confidence < MIN_CONFIDENCE) out.rejected.push({ candidate: c, reason: "low confidence" });
    else if (c.kind === "event" && !c.event_date) out.rejected.push({ candidate: c, reason: "event without a date" });
    else if (c.action === "update" && (!c.existing_id || !existingIds.has(c.existing_id))) out.rejected.push({ candidate: c, reason: "unknown memory to update" });
    else if (!c.text.trim()) out.rejected.push({ candidate: c, reason: "empty" });
    else out.accepted.push(c);
  }
  return out;
}

export async function extractCandidates(text: string, ctx: { timezone: string; existing: PlainMemory[]; recent?: string[]; channel: Channel | "admin"; userId?: string | null }): Promise<MemoryCandidate[]> {
  const settings = await getSettings();
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: ctx.timezone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const res = await llm().create({
    model: settings.ai.backgroundModel,
    system: EXTRACTION_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Today is ${today} (${localDateString(new Date(), ctx.timezone)}).\n\nExisting memories:\n${ctx.existing.length ? ctx.existing.map((m) => `- [${m.id}] (${m.kind}${m.event_date ? `, ${m.event_date}` : ""}) ${m.text}`).join("\n") : "(none)"}\n\n${ctx.recent?.length ? `Recent conversation:\n${ctx.recent.join("\n")}\n\n` : ""}User's latest message:\n${text}`,
      },
    ],
    maxTokens: 2048,
    effort: "low",
    jsonSchema: EXTRACTION_SCHEMA,
    timeoutMs: 30000,
  });
  await recordCost(res, { purpose: "memory", channel: ctx.channel, userId: ctx.userId ?? null });
  return ExtractionOutput.parse(JSON.parse(textOf(res.content))).memories;
}

/** Background job: extract and persist memories from one inbound message. */
export async function extractAndStore(userId: string, messageId: string, text: string, recent: string[]): Promise<ExtractionResult | null> {
  const store = db();
  const user = await store.get("users", userId);
  if (!user) return null;
  const prefs = await store.findOne("user_preferences", { where: { user_id: userId } });
  if (!prefs?.memory_enabled) return null; // consent check happens again at write time
  const existing = await listMemories(userId);
  const cands = await extractCandidates(text, { timezone: user.timezone, existing, recent, channel: user.channel, userId });
  const result = filterCandidates(cands, new Set(existing.map((m) => m.id)));
  for (const r of result.rejected) await logEvent(userId, null, "rejected", "system", r.reason);
  for (const c of result.accepted) {
    if (c.action === "update" && c.existing_id) {
      await store.update("memories", c.existing_id, { content_enc: seal(c.text)!, event_date: c.event_date, confidence: c.confidence, updated_at: nowIso() });
      await logEvent(userId, c.existing_id, "updated", "system");
    } else if (existing.length < MAX_MEMORIES_PER_USER) {
      await addMemory(user, { kind: c.kind, text: c.text, event_date: c.event_date, confidence: c.confidence, source_message_id: messageId });
    }
  }
  return result;
}

// ----------------------------------------------------------------- retrieval

const STOP = new Set("the a an and or but to of in on for with at is it i im i'm my me you your this that was be have has had so just really very about what how today".split(" "));
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w)));

export interface RetrievedMemory extends PlainMemory {
  reason: "profile" | "upcoming" | "recent_event" | "relevant";
  days_until?: number;
}

/**
 * Pick the memories worth showing the model this turn: the person's core
 * profile (name, style), events from yesterday to a week ahead, then
 * anything lexically related to what they just said.
 */
export function selectMemories(all: PlainMemory[], message: string, today: string, limit: number): RetrievedMemory[] {
  if (limit <= 0) return [];
  const out: RetrievedMemory[] = [];
  const dayDiff = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
  for (const m of all.filter((m) => m.kind === "name" || m.kind === "style")) out.push({ ...m, reason: "profile" });
  const events = all
    .filter((m) => m.kind === "event" && m.event_date)
    .map((m) => ({ m, d: dayDiff(m.event_date!) }))
    .filter((x) => x.d >= -1 && x.d <= 7)
    .sort((a, b) => a.d - b.d);
  for (const { m, d } of events) out.push({ ...m, reason: d < 0 ? "recent_event" : "upcoming", days_until: d });
  const q = words(message);
  const rest = all
    .filter((m) => !out.some((o) => o.id === m.id) && m.kind !== "event")
    .map((m) => {
      const w = words(m.text);
      let overlap = 0;
      for (const t of q) if (w.has(t)) overlap++;
      return { m, score: overlap + (m.kind === "technique" || m.kind === "preference" ? 0.25 : 0) };
    })
    .filter((x) => x.score >= 1 || (x.m.kind === "technique" && /\b(stress|anxious|anxiety|calm|breath|sleep|overwhelm|panic|relax)/i.test(message)))
    .sort((a, b) => b.score - a.score);
  for (const { m } of rest) out.push({ ...m, reason: "relevant" });
  return out.slice(0, limit);
}

export async function retrieveForTurn(user: UserRow, message: string, limit: number): Promise<RetrievedMemory[]> {
  const all = await listMemories(user.id);
  const picked = selectMemories(all, message, localDateString(new Date(), user.timezone), limit);
  for (const m of picked) {
    await db().update("memories", m.id, { last_used_at: nowIso() });
    await logEvent(user.id, m.id, "retrieved", "system");
  }
  return picked;
}

export function renderMemories(mems: RetrievedMemory[]): string {
  if (!mems.length) return "";
  const line = (m: RetrievedMemory) => {
    if (m.kind === "event" && m.days_until !== undefined) {
      const when = m.days_until === 0 ? "today" : m.days_until === 1 ? "tomorrow" : m.days_until === -1 ? "yesterday" : `in ${m.days_until} days (${m.event_date})`;
      return `- ${m.text} — ${when}`;
    }
    return `- ${m.text}`;
  };
  return `What you remember about this person (they opted in to memory; use naturally and only when helpful, never list it back unprompted):\n${mems.map(line).join("\n")}`;
}
