/**
 * WhatsApp channel adapter: webhook payload → durable jobs → engine → Meta.
 *
 * The webhook handler only validates, de-duplicates and enqueues (fast 200s
 * keep Meta from retrying). Jobs are keyed per user so one person's
 * messages are answered strictly in order, even with several workers.
 */
import { db, DuplicateError } from "../db";
import type { MessageRow } from "../db/types";
import { open, seal } from "../crypto";
import { nowIso, uuid } from "../ids";
import { errorMessage, log } from "../log";
import { getSettings } from "../settings";
import { enqueue } from "../jobs/queue";
import { findOrCreateWhatsappUser, phoneOf, deleteUserData } from "../users/service";
import { handleInbound } from "../engine/turn";
import { activeConversation, appendMessage } from "../engine/conversations";
import * as copy from "../engine/copy";
import { transcribe, transcriptionConfigured } from "../voice/transcribe";
import { downloadMedia, getMedia, markReadWithTyping, sendDocument, sendText, whatsappConfigured } from "./client";
import { parsePayload, textOfWaMessage, type WaStatus } from "./webhook";

export interface WhatsappJobPayload {
  userId: string;
  waMessageId: string;
  type: "text" | "audio" | "unsupported";
  textEnc: string | null;
  mediaId: string | null;
  mime: string | null;
  sentAt: string;
}

export async function ingestWebhook(body: unknown): Promise<{ queued: number; duplicates: number; statuses: number }> {
  const { messages, statuses } = parsePayload(body);
  const store = db();
  let queued = 0;
  let duplicates = 0;
  // Oldest first so per-user jobs are created in send order.
  for (const m of [...messages].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))) {
    try {
      await store.insert("webhook_events", { id: uuid(), provider: "whatsapp", external_id: `msg:${m.id}`, kind: "message", status: "received", error: null, created_at: nowIso() });
    } catch (e) {
      if (e instanceof DuplicateError) {
        duplicates++;
        continue;
      }
      throw e;
    }
    const { user } = await findOrCreateWhatsappUser(m.from);
    const text = textOfWaMessage(m);
    const type: WhatsappJobPayload["type"] = text !== null ? "text" : m.type === "audio" ? "audio" : "unsupported";
    const payload: WhatsappJobPayload = {
      userId: user.id,
      waMessageId: m.id,
      type,
      textEnc: seal(text), // job payloads are stored, so message text is encrypted here too
      mediaId: m.audio?.id ?? null,
      mime: m.audio?.mime_type ?? null,
      sentAt: new Date(Number(m.timestamp) * 1000).toISOString(),
    };
    await enqueue("whatsapp.inbound", payload as unknown as Record<string, unknown>, { lockKey: `user:${user.id}`, maxAttempts: 4 });
    await store.updateWhere("webhook_events", { external_id: `msg:${m.id}` }, { status: "processed" });
    queued++;
  }
  for (const s of statuses) await applyStatus(s);
  return { queued, duplicates, statuses: statuses.length };
}

const STATUS_ORDER: MessageRow["status"][] = ["queued", "sent", "delivered", "read"];

async function applyStatus(s: WaStatus) {
  const store = db();
  const status = s.status as MessageRow["status"] | "deleted";
  if (status === "deleted") return;
  const msg = await store.findOne("messages", { where: { wa_message_id: s.id } });
  if (msg) {
    // Statuses can arrive out of order; never move backwards (except to failed).
    if (status === "failed" || STATUS_ORDER.indexOf(status) > STATUS_ORDER.indexOf(msg.status)) {
      await store.update("messages", msg.id, { status, ...(status === "failed" ? { error: s.errors?.[0]?.title ?? s.errors?.[0]?.message ?? "delivery failed" } : {}) });
    }
  }
  const delivery = await store.findOne("checkin_deliveries", { where: { wa_message_id: s.id } });
  if (delivery && ["delivered", "read", "failed"].includes(status)) {
    await store.update("checkin_deliveries", delivery.id, { status: status as "delivered" | "read" | "failed", ...(status === "failed" ? { error: s.errors?.[0]?.title ?? "delivery failed" } : {}) });
  }
}

async function deliverReplies(phone: string, replies: { text: string; messageId: string; document?: { filename: string; json: unknown } }[]) {
  const store = db();
  for (const r of replies) {
    try {
      const ids = r.document ? [await sendDocument(phone, r.document.filename, JSON.stringify(r.document.json, null, 2), r.text)] : await sendText(phone, r.text);
      await store.update("messages", r.messageId, { status: "sent", wa_message_id: ids[0] ?? null });
    } catch (e) {
      log.error("whatsapp send failed", { messageId: r.messageId, error: errorMessage(e) });
      await store.update("messages", r.messageId, { status: "failed", error: errorMessage(e).slice(0, 300) });
    }
  }
}

/** Job handler for one inbound WhatsApp message. Idempotent across retries. */
export async function processWhatsappMessage(p: WhatsappJobPayload) {
  const store = db();
  const user = await store.get("users", p.userId);
  if (!user) return; // erased since the message arrived
  const phone = phoneOf(user);
  if (!phone) return;

  // Retry after a crash: the turn already ran – only send what wasn't sent.
  const existing = await store.findOne("messages", { where: { wa_message_id: p.waMessageId } });
  if (existing) {
    const pending = await store.find("messages", { where: { conversation_id: existing.conversation_id, direction: "outbound", status: "queued" }, gte: { seq: existing.seq + 1 }, orderBy: "seq" });
    if (whatsappConfigured()) await deliverReplies(phone, pending.map((m) => ({ text: open(m.content_enc), messageId: m.id })));
    return;
  }

  if (whatsappConfigured()) await markReadWithTyping(p.waMessageId);

  let text = p.textEnc ? open(p.textEnc) : "";
  let kind: "text" | "voice" | "unsupported" = "text";
  let preReply: string | null = null;
  const settings = await getSettings();

  if (p.type === "audio") {
    kind = "voice";
    if (!settings.voice.transcriptionEnabled || !transcriptionConfigured() || !p.mediaId) {
      preReply = copy.VOICE_UNAVAILABLE;
    } else {
      try {
        const media = await getMedia(p.mediaId);
        const audio = await downloadMedia(media.url);
        const t = await transcribe(audio, p.mime ?? media.mime_type);
        text = t.text;
        if (!text) preReply = "I couldn't quite make that voice note out – could you try again or type it?";
        else if (t.confidence < settings.voice.confirmBelowConfidence) preReply = `I want to make sure I heard you right. Did you say: "${text}"?`;
      } catch (e) {
        log.warn("voice transcription failed", { error: errorMessage(e) });
        preReply = copy.VOICE_UNAVAILABLE;
      }
    }
  } else if (p.type === "unsupported") {
    kind = "unsupported";
    preReply = copy.UNSUPPORTED_MEDIA;
  }

  if (preReply) {
    // Persist and answer without involving the model.
    const conv = await activeConversation(user, "whatsapp");
    await appendMessage(conv, { direction: "inbound", kind, text: text || null, wa_message_id: p.waMessageId, status: "received", latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, safety_severity: "none", error: null, sent_at: p.sentAt });
    const out = await appendMessage(conv, { direction: "outbound", kind: "system", text: preReply, wa_message_id: null, status: "queued", latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, safety_severity: "none", error: null });
    await store.update("users", user.id, { last_inbound_at: nowIso(), last_active_at: nowIso() });
    if (whatsappConfigured()) await deliverReplies(phone, [{ text: preReply, messageId: out.id }]);
    return;
  }

  const result = await handleInbound({ user, channel: "whatsapp", text, kind, waMessageId: p.waMessageId, sentAt: p.sentAt });
  if (whatsappConfigured()) await deliverReplies(phone, result.replies);
  if (result.deleted) await deleteUserData(user.id, "whatsapp", null);
}
