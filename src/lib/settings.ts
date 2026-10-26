/**
 * Runtime settings editable from the dashboard (no redeploy). Stored as one
 * JSON document; defaults are merged in so new keys roll out safely.
 */
import { z } from "zod";
import { db } from "./db";
import { nowIso } from "./ids";

export const MODEL_OPTIONS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"] as const;

export const SettingsSchema = z.object({
  ai: z.object({
    model: z.enum(MODEL_OPTIONS).default("claude-opus-5-5"),
    effort: z.enum(["low", "medium", "high"]).default("low"),
    /** Model used for background memory extraction, summaries and safety review. */
    backgroundModel: z.enum(MODEL_OPTIONS).default("claude-opus-5-5"),
    maxOutputTokens: z.number().int().min(256).max(16000).default(2048),
    timeoutMs: z.number().int().min(5000).max(120000).default(45000),
    maxToolRounds: z.number().int().min(1).max(6).default(3),
    historyMessages: z.number().int().min(4).max(60).default(24),
    summariseAfterMessages: z.number().int().min(10).max(200).default(40),
    memoryRetrievalLimit: z.number().int().min(0).max(20).default(6),
    /** Hard stop for AI spend per UTC day across all users. 0 disables the cap. */
    dailyCostLimitUsd: z.number().min(0).default(50),
    /** Per-user AI replies per UTC day. */
    perUserDailyReplies: z.number().int().min(1).default(200),
    modelSafetyReview: z.boolean().default(true),
  }),
  privacy: z.object({
    noticeVersion: z.string().default("2026-10"),
    messageRetentionDays: z.number().int().min(1).max(3650).default(180),
    webhookRetentionDays: z.number().int().min(1).max(365).default(30),
    jobRetentionDays: z.number().int().min(1).max(365).default(14),
    eventMemoryDays: z.number().int().min(1).max(365).default(14),
    /** Ask users to opt into memory during onboarding (memory is always off until they do). */
    offerMemoryAtOnboarding: z.boolean().default(true),
    /** Allow authorised staff to open production transcripts (always audited, reason required). */
    allowTranscriptAccess: z.boolean().default(true),
  }),
  checkins: z.object({
    enabled: z.boolean().default(true),
    quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default("22:30"),
    quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default("07:00"),
    maxPerWeek: z.number().int().min(1).max(21).default(7),
  }),
  voice: z.object({
    transcriptionEnabled: z.boolean().default(true),
    confirmBelowConfidence: z.number().min(0).max(1).default(0.6),
  }),
});

export type AppSettings = z.infer<typeof SettingsSchema>;

const DEFAULTS = SettingsSchema.parse({ ai: {}, privacy: {}, checkins: {}, voice: {} });

let cache: { at: number; value: AppSettings } | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 5000) return cache.value;
  const row = await db().get("settings", "global");
  const raw = (row?.data ?? {}) as Partial<Record<keyof AppSettings, unknown>>;
  const value = SettingsSchema.parse({
    ai: { ...(raw.ai as object) },
    privacy: { ...(raw.privacy as object) },
    checkins: { ...(raw.checkins as object) },
    voice: { ...(raw.voice as object) },
  });
  cache = { at: Date.now(), value };
  return value;
}

export async function updateSettings(patch: DeepPartial<AppSettings>, by: string | null): Promise<AppSettings> {
  const current = await getSettings();
  const merged = SettingsSchema.parse({
    ai: { ...current.ai, ...(patch.ai ?? {}) },
    privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
    checkins: { ...current.checkins, ...(patch.checkins ?? {}) },
    voice: { ...current.voice, ...(patch.voice ?? {}) },
  });
  const store = db();
  const existing = await store.get("settings", "global");
  if (existing) await store.update("settings", "global", { data: merged, updated_at: nowIso(), updated_by: by });
  else await store.insert("settings", { id: "global", data: merged, updated_at: nowIso(), updated_by: by });
  cache = null;
  return merged;
}

export function clearSettingsCache() {
  cache = null;
}

export const defaultSettings = DEFAULTS;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };
