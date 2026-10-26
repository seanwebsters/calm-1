import { db } from "../db";
import type { Channel, ConversationRow, MessageRow, Severity, UserRow } from "../db/types";
import { open, seal } from "../crypto";
import { nowIso, uuid } from "../ids";
import { maxSeverity } from "../safety/rules";

/** A new conversation starts after this much silence. */
export const SESSION_GAP_HOURS = 8;

export async function activeConversation(user: UserRow, channel: Channel): Promise<ConversationRow> {
  const store = db();
  const [latest] = await store.find("conversations", { where: { user_id: user.id }, orderBy: "last_message_at", desc: true, limit: 1 });
  const fresh = latest && latest.status !== "closed" && Date.now() - new Date(latest.last_message_at).getTime() < SESSION_GAP_HOURS * 3600_000;
  if (latest && fresh) return latest;
  if (latest && latest.status !== "closed") await store.update("conversations", latest.id, { status: "closed" });
  return store.insert("conversations", {
    id: uuid(),
    user_id: user.id,
    channel,
    status: "active",
    started_at: nowIso(),
    last_message_at: nowIso(),
    message_count: 0,
    summary_enc: null,
    summary_upto_seq: 0,
    model: null,
    prompt_version: null,
    max_severity: "none",
    had_error: false,
  });
}

export type NewMessage = Omit<MessageRow, "id" | "conversation_id" | "user_id" | "seq" | "created_at" | "content_enc" | "sent_at"> & {
  text: string | null;
  sent_at?: string;
};

export async function appendMessage(conv: ConversationRow, m: NewMessage): Promise<MessageRow> {
  const store = db();
  const fresh = (await store.get("conversations", conv.id)) ?? conv;
  const seq = fresh.message_count + 1;
  const { text, ...rest } = m;
  const row = await store.insert("messages", {
    ...rest,
    id: uuid(),
    conversation_id: conv.id,
    user_id: conv.user_id,
    seq,
    content_enc: seal(text),
    sent_at: m.sent_at ?? nowIso(),
    created_at: nowIso(),
  });
  await store.update("conversations", conv.id, {
    message_count: seq,
    last_message_at: row.created_at,
    status: "active",
    max_severity: maxSeverity(fresh.max_severity, m.safety_severity),
    ...(m.model ? { model: m.model } : {}),
    ...(m.prompt_version ? { prompt_version: m.prompt_version } : {}),
    ...(m.error ? { had_error: true } : {}),
  });
  conv.message_count = seq;
  return row;
}

export async function markConversationSeverity(convId: string, severity: Severity) {
  const conv = await db().get("conversations", convId);
  if (conv) await db().update("conversations", convId, { max_severity: maxSeverity(conv.max_severity, severity) });
}

export interface PlainMessage {
  id: string;
  seq: number;
  direction: "inbound" | "outbound";
  kind: MessageRow["kind"];
  text: string;
  at: string;
}

export async function messagesAfter(convId: string, afterSeq: number, limit: number): Promise<PlainMessage[]> {
  const rows = await db().find("messages", { where: { conversation_id: convId }, gte: { seq: afterSeq + 1 }, orderBy: "seq", desc: true, limit });
  return rows.reverse().map((r) => ({ id: r.id, seq: r.seq, direction: r.direction, kind: r.kind, text: open(r.content_enc), at: r.created_at }));
}

/** Last message from the previous conversation(s), for cross-session continuity. */
export async function previousConversation(userId: string, currentId: string): Promise<ConversationRow | null> {
  const rows = await db().find("conversations", { where: { user_id: userId }, neq: { id: currentId }, orderBy: "last_message_at", desc: true, limit: 1 });
  return rows[0] ?? null;
}
