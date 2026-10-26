/**
 * Which pipe WhatsApp messages travel through: Twilio (if configured) or
 * Meta's Cloud API directly. Everything above this layer is identical.
 */
import { twilioConfigured, twilioDownloadMedia, twilioSendText } from "../twilio/client";
import { downloadMedia, getMedia, markReadWithTyping, sendDocument, sendTemplate, sendText, whatsappConfigured } from "./client";

export type Provider = "twilio" | "meta";

export function provider(): Provider | null {
  if (twilioConfigured()) return "twilio";
  if (whatsappConfigured()) return "meta";
  return null;
}

export function transportConfigured(): boolean {
  return provider() !== null;
}

export async function sendWhatsappText(phoneDigits: string, body: string): Promise<string[]> {
  return provider() === "twilio" ? twilioSendText(phoneDigits, body) : sendText(phoneDigits, body);
}

export async function sendWhatsappDocument(phoneDigits: string, filename: string, content: string, caption: string): Promise<string[]> {
  if (provider() === "twilio") {
    // Twilio needs a public URL for files; keep exports private and explain instead.
    return twilioSendText(phoneDigits, "I can't send files on this line yet. Ask the Calm team and they'll send you a copy of your data securely.");
  }
  return [await sendDocument(phoneDigits, filename, content, caption)];
}

/** Approved templates are only supported through Meta directly for now. */
export async function sendWhatsappTemplate(phoneDigits: string, name: string, language: string): Promise<string> {
  if (provider() === "twilio") throw new Error("Template messages aren't set up for Twilio – check-ins can only be sent within 24h of the user's last message");
  return sendTemplate(phoneDigits, name, language);
}

export async function acknowledgeInbound(messageId: string): Promise<void> {
  if (provider() === "meta") await markReadWithTyping(messageId);
}

/** mediaRef is a Meta media id, or a Twilio MediaUrl. */
export async function fetchAudio(mediaRef: string, mime: string | null): Promise<{ audio: Buffer; mime: string }> {
  if (mediaRef.startsWith("https://")) return { audio: await twilioDownloadMedia(mediaRef), mime: mime ?? "audio/ogg" };
  const media = await getMedia(mediaRef);
  return { audio: await downloadMedia(media.url), mime: mime ?? media.mime_type };
}
