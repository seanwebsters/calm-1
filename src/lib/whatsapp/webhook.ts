import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "../env";

/** GET verification handshake from Meta. Returns the challenge to echo, or null. */
export function verifyChallenge(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge || !env.whatsappVerifyToken) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(env.whatsappVerifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

/** Validate X-Hub-Signature-256 against the raw body using the app secret. */
export function verifySignature(rawBody: string, header: string | null): boolean {
  if (!env.whatsappAppSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", env.whatsappAppSecret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice(7), "hex");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function signForTest(rawBody: string, secret = env.whatsappAppSecret): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

const MessageSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    timestamp: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    audio: z.object({ id: z.string(), mime_type: z.string().optional(), voice: z.boolean().optional() }).optional(),
    interactive: z.object({ button_reply: z.object({ title: z.string() }).optional(), list_reply: z.object({ title: z.string() }).optional() }).passthrough().optional(),
    button: z.object({ text: z.string() }).optional(),
  })
  .passthrough();

const StatusSchema = z
  .object({
    id: z.string(),
    status: z.enum(["sent", "delivered", "read", "failed", "deleted"]).or(z.string()),
    timestamp: z.string(),
    recipient_id: z.string().optional(),
    errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional(), message: z.string().optional() })).optional(),
  })
  .passthrough();

const PayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              metadata: z.object({ phone_number_id: z.string().optional() }).passthrough().optional(),
              messages: z.array(MessageSchema).optional(),
              statuses: z.array(StatusSchema).optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
});

export type InboundWaMessage = z.infer<typeof MessageSchema>;
export type WaStatus = z.infer<typeof StatusSchema>;

export function parsePayload(body: unknown): { messages: InboundWaMessage[]; statuses: WaStatus[]; phoneNumberIds: string[] } {
  const p = PayloadSchema.parse(body);
  const out = { messages: [] as InboundWaMessage[], statuses: [] as WaStatus[], phoneNumberIds: [] as string[] };
  if (p.object !== "whatsapp_business_account") return out;
  for (const e of p.entry)
    for (const c of e.changes) {
      if (c.field !== "messages") continue;
      if (c.value.metadata?.phone_number_id) out.phoneNumberIds.push(c.value.metadata.phone_number_id);
      out.messages.push(...(c.value.messages ?? []));
      out.statuses.push(...(c.value.statuses ?? []));
    }
  return out;
}

export function textOfWaMessage(m: InboundWaMessage): string | null {
  if (m.type === "text") return m.text?.body ?? null;
  if (m.type === "button") return m.button?.text ?? null;
  if (m.type === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
  return null;
}
