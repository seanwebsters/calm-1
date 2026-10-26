/**
 * Twilio WhatsApp channel. Lets Calm-1 run on WhatsApp through Twilio
 * (including the free Sandbox, which needs no Meta business verification).
 * Server-only: credentials never reach the browser.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";
import { NotConfiguredError } from "../errors";

export function twilioConfigured(): boolean {
  return !!(env.twilioAccountSid && env.twilioAuthToken && env.twilioWhatsappFrom);
}

function auth() {
  if (!twilioConfigured()) throw new NotConfiguredError("Twilio", ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM"]);
  return `Basic ${Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64")}`;
}

/** "whatsapp:+447700900123" → "447700900123" */
export function digitsFromTwilio(addr: string): string {
  return addr.replace(/^whatsapp:/, "").replace(/[^\d]/g, "");
}

function whatsappAddress(v: string): string {
  const t = v.trim();
  if (t.startsWith("whatsapp:")) return t;
  return `whatsapp:+${t.replace(/[^\d]/g, "")}`;
}

/**
 * Validate X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + sorted key/value pairs)).
 * `url` must be the exact public URL Twilio requested.
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null, token = env.twilioAuthToken): boolean {
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data, "utf8").digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** WhatsApp messages via Twilio are limited to 1600 characters. */
export function splitForTwilio(text: string, max = 1500): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const para of text.split(/\n\n/)) {
    const next = cur ? `${cur}\n\n${para}` : para;
    if (next.length > max && cur) {
      out.push(cur);
      cur = para;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.flatMap((p) => (p.length > max ? (p.match(new RegExp(`[\\s\\S]{1,${max}}`, "g")) ?? []) : [p]));
}

export async function twilioSendText(toDigits: string, body: string): Promise<string[]> {
  const ids: string[] = [];
  const statusCallback = env.appUrl.startsWith("https://") ? `${env.appUrl.replace(/\/$/, "")}/api/twilio/status` : null;
  for (const chunk of splitForTwilio(body)) {
    let attempt = 0;
    for (;;) {
      const form = new URLSearchParams({ From: whatsappAddress(env.twilioWhatsappFrom), To: whatsappAddress(toDigits), Body: chunk });
      if (statusCallback) form.set("StatusCallback", statusCallback);
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        ids.push(((await res.json()) as { sid: string }).sid);
        break;
      }
      const err = (await res.json().catch(() => ({}))) as { message?: string; code?: number };
      if ((res.status === 429 || res.status >= 500) && attempt++ < 3) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      throw new Error(`Twilio ${res.status}${err.code ? ` (${err.code})` : ""}: ${err.message ?? "send failed"}`);
    }
  }
  return ids;
}

export async function twilioDownloadMedia(url: string, maxBytes = 16 * 1024 * 1024): Promise<Buffer> {
  const res = await fetch(url, { headers: { Authorization: auth() }, redirect: "follow", signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Twilio media download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error("Media too large");
  return buf;
}

export async function twilioHealth(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  const t = Date.now();
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioAccountSid}.json`, { headers: { Authorization: auth() }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { ok: false, detail: `Twilio ${res.status}: check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN`, latencyMs: Date.now() - t };
    const a = (await res.json()) as { friendly_name?: string; status?: string };
    return { ok: a.status === "active", detail: `Twilio · ${a.friendly_name ?? "account"} · from ${env.twilioWhatsappFrom}`, latencyMs: Date.now() - t };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - t };
  }
}
