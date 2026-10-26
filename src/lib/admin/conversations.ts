import { db } from "../db";
import type { Channel, ConversationRow } from "../db/types";
import { open } from "../crypto";

export interface ConversationListItem {
  id: string;
  anonId: string;
  channel: Channel;
  status: ConversationRow["status"];
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  maxSeverity: string;
  hadError: boolean;
  model: string | null;
  promptVersion: number | null;
  /** Only populated for non-production conversations. */
  preview: string | null;
}

/**
 * Conversation listing. Production previews are never included: opening a
 * production transcript is a separate, permissioned and audited action.
 */
export async function listConversations(opts: { channels: Channel[]; limit?: number; q?: string; status?: string; severity?: string; model?: string; since?: string; errors?: boolean }): Promise<ConversationListItem[]> {
  const store = db();
  const users = await store.find("users", { in: { channel: opts.channels }, columns: ["id", "anon_id"] });
  const anon = new Map(users.map((u) => [u.id, u.anon_id]));
  let convs = await store.find("conversations", { in: { channel: opts.channels }, orderBy: "last_message_at", desc: true, ...(opts.since ? { gte: { last_message_at: opts.since } } : {}), limit: opts.q ? undefined : (opts.limit ?? 50) * 3 });
  convs = convs.filter((c) => anon.has(c.user_id));
  if (opts.q) convs = convs.filter((c) => anon.get(c.user_id)!.toLowerCase().includes(opts.q!.toLowerCase()));
  if (opts.status && opts.status !== "all") convs = convs.filter((c) => c.status === opts.status);
  if (opts.severity === "flagged") convs = convs.filter((c) => c.max_severity !== "none");
  else if (opts.severity && opts.severity !== "all") convs = convs.filter((c) => c.max_severity === opts.severity);
  if (opts.model && opts.model !== "all") convs = convs.filter((c) => c.model === opts.model);
  if (opts.errors) convs = convs.filter((c) => c.had_error);
  convs = convs.slice(0, opts.limit ?? 50);
  const out: ConversationListItem[] = [];
  for (const c of convs) {
    let preview: string | null = null;
    if (c.channel !== "whatsapp") {
      const [last] = await store.find("messages", { where: { conversation_id: c.id }, orderBy: "seq", desc: true, limit: 1 });
      preview = last ? open(last.content_enc).slice(0, 140) : null;
    }
    out.push({ id: c.id, anonId: anon.get(c.user_id)!, channel: c.channel, status: c.status, startedAt: c.started_at, lastMessageAt: c.last_message_at, messageCount: c.message_count, maxSeverity: c.max_severity, hadError: c.had_error, model: c.model, promptVersion: c.prompt_version, preview });
  }
  return out;
}

/** Operational metadata for one conversation – no message content. */
export async function conversationMeta(id: string) {
  const store = db();
  const conv = await store.get("conversations", id);
  if (!conv) return null;
  const user = await store.get("users", conv.user_id);
  const msgs = await store.find("messages", { where: { conversation_id: id }, orderBy: "seq", columns: ["id", "seq", "direction", "kind", "status", "latency_ms", "input_tokens", "output_tokens", "model", "prompt_version", "safety_severity", "error", "created_at"] });
  const tools = await store.find("tool_invocations", { where: { conversation_id: id }, orderBy: "created_at" });
  const costs = await store.find("api_costs", { where: { conversation_id: id }, columns: ["cost_usd", "purpose", "input_tokens", "output_tokens", "cache_read_tokens"] });
  const safety = await store.find("safety_events", { where: { conversation_id: id }, orderBy: "created_at" });
  const latencies = msgs.filter((m) => m.latency_ms && m.model).map((m) => m.latency_ms!);
  return {
    conversation: conv,
    anonId: user?.anon_id ?? "deleted",
    messages: msgs,
    tools,
    safety,
    totals: {
      cost: costs.reduce((s, c) => s + Number(c.cost_usd), 0),
      inputTokens: costs.reduce((s, c) => s + c.input_tokens + c.cache_read_tokens, 0),
      outputTokens: costs.reduce((s, c) => s + c.output_tokens, 0),
      avgLatency: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
      failures: msgs.filter((m) => m.status === "failed" || m.error).length,
    },
  };
}

export async function transcript(id: string) {
  const msgs = await db().find("messages", { where: { conversation_id: id }, orderBy: "seq" });
  return msgs.map((m) => ({ id: m.id, seq: m.seq, direction: m.direction, kind: m.kind, text: open(m.content_enc), at: m.created_at, status: m.status, latencyMs: m.latency_ms, severity: m.safety_severity, error: m.error }));
}
