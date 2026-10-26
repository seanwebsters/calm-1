/**
 * Twilio → Calm-1. Inbound messages are de-duplicated and queued exactly
 * like Meta's, then answered by the same engine and delivered via Twilio.
 */
import { db, DuplicateError } from "../db";
import type { MessageRow } from "../db/types";
import { seal } from "../crypto";
import { nowIso, uuid } from "../ids";
import { enqueue } from "../jobs/queue";
import { findOrCreateWhatsappUser } from "../users/service";
import type { WhatsappJobPayload } from "../whatsapp/adapter";
import { digitsFromTwilio } from "./client";

export async function ingestTwilioMessage(p: Record<string, string>): Promise<{ queued: boolean; duplicate: boolean }> {
  const sid = p.MessageSid ?? p.SmsMessageSid;
  if (!sid || !p.From?.startsWith("whatsapp:")) return { queued: false, duplicate: false };
  try {
    await db().insert("webhook_events", { id: uuid(), provider: "whatsapp", external_id: `twilio:${sid}`, kind: "message", status: "received", error: null, created_at: nowIso() });
  } catch (e) {
    if (e instanceof DuplicateError) return { queued: false, duplicate: true };
    throw e;
  }
  const { user } = await findOrCreateWhatsappUser(digitsFromTwilio(p.From));
  const numMedia = Number(p.NumMedia ?? "0");
  const mediaType = p.MediaContentType0 ?? "";
  const body = p.Body ?? "";
  const type: WhatsappJobPayload["type"] = numMedia > 0 && mediaType.startsWith("audio/") ? "audio" : numMedia > 0 && !body ? "unsupported" : "text";
  const payload: WhatsappJobPayload = {
    userId: user.id,
    waMessageId: sid,
    type,
    textEnc: type === "text" ? seal(body) : null,
    mediaId: type === "audio" ? (p.MediaUrl0 ?? null) : null,
    mime: type === "audio" ? mediaType : null,
    sentAt: nowIso(),
  };
  await enqueue("whatsapp.inbound", payload as unknown as Record<string, unknown>, { lockKey: `user:${user.id}`, maxAttempts: 4 });
  await db().updateWhere("webhook_events", { external_id: `twilio:${sid}` }, { status: "processed" });
  return { queued: true, duplicate: false };
}

const MAP: Record<string, MessageRow["status"]> = { queued: "queued", accepted: "queued", sending: "queued", sent: "sent", delivered: "delivered", read: "read", failed: "failed", undelivered: "failed" };
const ORDER: MessageRow["status"][] = ["queued", "sent", "delivered", "read"];

export async function applyTwilioStatus(p: Record<string, string>) {
  const status = MAP[p.MessageStatus ?? ""];
  if (!status || !p.MessageSid) return;
  const store = db();
  const msg = await store.findOne("messages", { where: { wa_message_id: p.MessageSid } });
  if (msg && (status === "failed" || ORDER.indexOf(status) > ORDER.indexOf(msg.status))) {
    await store.update("messages", msg.id, { status, ...(status === "failed" ? { error: `Twilio ${p.ErrorCode ?? ""} ${p.ErrorMessage ?? "delivery failed"}`.trim() } : {}) });
  }
  const d = await store.findOne("checkin_deliveries", { where: { wa_message_id: p.MessageSid } });
  if (d && (status === "delivered" || status === "read" || status === "failed")) await store.update("checkin_deliveries", d.id, { status });
}
