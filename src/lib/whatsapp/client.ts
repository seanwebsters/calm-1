/**
 * Meta WhatsApp Cloud API client (Graph API). Server-only: the access token
 * never leaves the server.
 */
import { env } from "../env";
import { NotConfiguredError } from "../errors";
import { log } from "../log";

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: number | null,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Meta error 131047: more than 24h since the user last messaged – a template is required. */
export const OUTSIDE_WINDOW_CODE = 131047;
/** Meta error 131026: message undeliverable (e.g. not a WhatsApp user). */
export const UNDELIVERABLE_CODE = 131026;

export function whatsappConfigured(): boolean {
  return !!(env.whatsappAccessToken && env.whatsappPhoneNumberId);
}

function base() {
  return `https://graph.facebook.com/${env.whatsappGraphVersion}`;
}

function requireConfig() {
  if (!whatsappConfigured()) throw new NotConfiguredError("WhatsApp", ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]);
}

async function graph<T>(path: string, init: RequestInit & { retries?: number } = {}): Promise<T> {
  requireConfig();
  const retries = init.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${env.whatsappAccessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15000),
    }).catch((e: unknown) => {
      if (attempt < retries) return null;
      throw new WhatsAppApiError(`Network error calling WhatsApp: ${String(e)}`, 0, null, true);
    });
    if (res === null) {
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } };
    const code = body.error?.code ?? null;
    const retryable = res.status === 429 || res.status >= 500 || code === 130429 || code === 131016;
    if (retryable && attempt < retries) {
      await sleep(backoff(attempt));
      continue;
    }
    throw new WhatsAppApiError(body.error?.message ?? `WhatsApp API ${res.status}`, res.status, code, retryable);
  }
}

const backoff = (attempt: number) => Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SendResponse {
  messages: { id: string }[];
}

/** WhatsApp text bodies are limited to 4096 characters; split on paragraph boundaries. */
export function splitForWhatsapp(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const parts: string[] = [];
  let current = "";
  for (const para of text.split(/\n\n/)) {
    if ((current + "\n\n" + para).length > max && current) {
      parts.push(current);
      current = para;
    } else current = current ? `${current}\n\n${para}` : para;
  }
  if (current) parts.push(current);
  return parts.flatMap((p) => (p.length > max ? p.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? [] : [p]));
}

export async function sendText(to: string, body: string, opts: { replyTo?: string } = {}): Promise<string[]> {
  const ids: string[] = [];
  for (const chunk of splitForWhatsapp(body)) {
    const res = await graph<SendResponse>(`/${env.whatsappPhoneNumberId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: chunk, preview_url: true },
        ...(opts.replyTo && ids.length === 0 ? { context: { message_id: opts.replyTo } } : {}),
      }),
    });
    ids.push(res.messages[0]!.id);
  }
  return ids;
}

export async function sendTemplate(to: string, name: string, language: string, bodyParams: string[] = []): Promise<string> {
  const res = await graph<SendResponse>(`/${env.whatsappPhoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name,
        language: { code: language },
        ...(bodyParams.length ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] } : {}),
      },
    }),
  });
  return res.messages[0]!.id;
}

/** Mark as read and show the typing indicator while Calm-1 composes a reply. */
export async function markReadWithTyping(messageId: string): Promise<void> {
  try {
    await graph(`/${env.whatsappPhoneNumberId}/messages`, {
      method: "POST",
      retries: 0,
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
    });
  } catch (e) {
    log.warn("whatsapp mark-read failed", { error: String(e) });
  }
}

export async function getMedia(mediaId: string): Promise<{ url: string; mime_type: string; file_size?: number }> {
  return graph(`/${mediaId}`, { method: "GET" });
}

export async function downloadMedia(url: string, maxBytes = 16 * 1024 * 1024): Promise<Buffer> {
  requireConfig();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.whatsappAccessToken}` }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new WhatsAppApiError(`Media download failed (${res.status})`, res.status, null, res.status >= 500);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new WhatsAppApiError("Media too large", 413, null, false);
  return buf;
}

export interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

export async function listTemplates(): Promise<MetaTemplate[]> {
  if (!env.whatsappBusinessAccountId) throw new NotConfiguredError("WhatsApp templates", ["WHATSAPP_BUSINESS_ACCOUNT_ID"]);
  const res = await graph<{ data: MetaTemplate[] }>(`/${env.whatsappBusinessAccountId}/message_templates?fields=id,name,status,category,language&limit=200`, { method: "GET" });
  return res.data;
}

export async function submitTemplate(t: { name: string; language: string; category: "utility" | "marketing"; body: string }): Promise<{ id: string; status: string; category: string }> {
  if (!env.whatsappBusinessAccountId) throw new NotConfiguredError("WhatsApp templates", ["WHATSAPP_BUSINESS_ACCOUNT_ID"]);
  return graph(`/${env.whatsappBusinessAccountId}/message_templates`, {
    method: "POST",
    body: JSON.stringify({ name: t.name, language: t.language, category: t.category.toUpperCase(), components: [{ type: "BODY", text: t.body }] }),
  });
}

export async function phoneNumberHealth(): Promise<{ ok: boolean; detail: string; latencyMs: number; info?: Record<string, unknown> }> {
  if (!whatsappConfigured()) return { ok: false, detail: "Not configured", latencyMs: 0 };
  const t = Date.now();
  try {
    const info = await graph<Record<string, unknown>>(`/${env.whatsappPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating,name_status,messaging_limit_tier`, { method: "GET", retries: 0 });
    return { ok: true, detail: `${info.verified_name ?? "Connected"} · quality ${info.quality_rating ?? "unknown"}`, latencyMs: Date.now() - t, info };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t };
  }
}

/** Upload a file and send it as a document (used for data exports). */
export async function sendDocument(to: string, filename: string, content: string, caption?: string): Promise<string> {
  requireConfig();
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "text/plain");
  form.append("file", new Blob([content], { type: "text/plain" }), filename);
  const up = await fetch(`${base()}/${env.whatsappPhoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.whatsappAccessToken}` },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  if (!up.ok) throw new WhatsAppApiError(`Media upload failed (${up.status})`, up.status, null, up.status >= 500);
  const { id } = (await up.json()) as { id: string };
  const res = await graph<SendResponse>(`/${env.whatsappPhoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "document", document: { id, filename, ...(caption ? { caption } : {}) } }),
  });
  return res.messages[0]!.id;
}
