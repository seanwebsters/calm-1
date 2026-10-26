/**
 * Voice-note transcription. Pluggable provider; ElevenLabs Scribe is
 * implemented. Audio is processed in memory and never stored.
 */
import { env } from "../env";
import { NotConfiguredError } from "../errors";

export interface Transcript {
  text: string;
  language: string | null;
  /** 0–1. For Scribe this is the language-identification probability, used as a quality proxy. */
  confidence: number;
}

export function transcriptionConfigured(): boolean {
  return !!env.elevenLabsApiKey;
}

export async function transcribe(audio: Buffer, mime: string): Promise<Transcript> {
  if (!transcriptionConfigured()) throw new NotConfiguredError("Voice transcription", ["ELEVENLABS_API_KEY"]);
  const form = new FormData();
  form.append("model_id", "scribe_v1");
  form.append("tag_audio_events", "false");
  form.append("file", new Blob([new Uint8Array(audio)], { type: mime.split(";")[0] || "audio/ogg" }), "voice-note.ogg");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": env.elevenLabsApiKey },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { text?: string; language_code?: string; language_probability?: number };
  return { text: (data.text ?? "").trim(), language: data.language_code ?? null, confidence: data.language_probability ?? 1 };
}
