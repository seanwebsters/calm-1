/**
 * Structured JSON logging. Never log message content, phone numbers or
 * secrets – pass identifiers (anon ids, row ids) instead.
 */
type Level = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = /(token|secret|password|key|phone|content|text|body|authorization)/i;

function redact(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = REDACT_KEYS.test(k) && typeof v === "string" ? "[redacted]" : v;
  }
  return out;
}

function emit(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  if (process.env.VITEST && level !== "error") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(meta) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
