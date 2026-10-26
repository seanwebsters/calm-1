import { z } from "zod";
import { db } from "../db";
import type { PersonalityTraits, PromptVersionRow } from "../db/types";
import { AppError } from "../errors";
import { nowIso, uuid } from "../ids";
import { DEFAULT_INSTRUCTIONS, DEFAULT_TRAITS } from "./prompt";

export const TraitsSchema = z.object({
  warmth: z.number().int().min(0).max(100),
  playfulness: z.number().int().min(0).max(100),
  responseLength: z.number().int().min(0).max(100),
  questionFrequency: z.number().int().min(0).max(100),
  proactivity: z.number().int().min(0).max(100),
  formality: z.number().int().min(0).max(100),
  mindfulness: z.number().int().min(0).max(100),
}) satisfies z.ZodType<PersonalityTraits>;

export const InstructionsSchema = z.string().trim().min(20, "Instructions are too short").max(8000, "Keep instructions under 8,000 characters");

let publishedCache: { at: number; row: PromptVersionRow } | null = null;

async function ensureSeeded(): Promise<void> {
  const store = db();
  if ((await store.count("prompt_versions")) > 0) return;
  await store.insert("prompt_versions", {
    id: uuid(),
    version: 1,
    status: "published",
    instructions: DEFAULT_INSTRUCTIONS,
    traits: DEFAULT_TRAITS,
    notes: "Initial Calm-1 voice",
    created_by: "system",
    created_at: nowIso(),
    published_at: nowIso(),
  });
}

export async function getPublished(): Promise<PromptVersionRow> {
  if (publishedCache && Date.now() - publishedCache.at < 5000) return publishedCache.row;
  await ensureSeeded();
  const row = await db().findOne("prompt_versions", { where: { status: "published" } });
  if (!row) throw new Error("No published prompt version");
  publishedCache = { at: Date.now(), row };
  return row;
}

export async function getVersion(version: number): Promise<PromptVersionRow | null> {
  await ensureSeeded();
  return db().findOne("prompt_versions", { where: { version } });
}

export async function listVersions(): Promise<PromptVersionRow[]> {
  await ensureSeeded();
  return db().find("prompt_versions", { orderBy: "version", desc: true });
}

async function nextVersion(): Promise<number> {
  const [latest] = await db().find("prompt_versions", { orderBy: "version", desc: true, limit: 1 });
  return (latest?.version ?? 0) + 1;
}

/** One draft at a time: returns the existing draft or creates one from the published version. */
export async function getOrCreateDraft(by: string): Promise<PromptVersionRow> {
  await ensureSeeded();
  const existing = await db().findOne("prompt_versions", { where: { status: "draft" } });
  if (existing) return existing;
  const published = await getPublished();
  return db().insert("prompt_versions", {
    id: uuid(),
    version: await nextVersion(),
    status: "draft",
    instructions: published.instructions,
    traits: published.traits,
    notes: null,
    created_by: by,
    created_at: nowIso(),
    published_at: null,
  });
}

export async function updateDraft(id: string, patch: { instructions?: string; traits?: PersonalityTraits; notes?: string | null }) {
  const row = await db().get("prompt_versions", id);
  if (!row || row.status !== "draft") throw new AppError("Only drafts can be edited.");
  return db().update("prompt_versions", id, {
    ...(patch.instructions !== undefined ? { instructions: InstructionsSchema.parse(patch.instructions) } : {}),
    ...(patch.traits ? { traits: TraitsSchema.parse(patch.traits) } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
  });
}

export async function discardDraft(id: string) {
  const row = await db().get("prompt_versions", id);
  if (!row || row.status !== "draft") throw new AppError("Only drafts can be discarded.");
  await db().remove("prompt_versions", id);
}

export async function publish(id: string): Promise<PromptVersionRow> {
  const store = db();
  const row = await store.get("prompt_versions", id);
  if (!row) throw new AppError("Version not found.", 404);
  if (row.status === "published") return row;
  if (row.status !== "draft") throw new AppError("Publish a draft, or roll back to create one from an older version.");
  await store.updateWhere("prompt_versions", { status: "published" }, { status: "archived" });
  const out = (await store.update("prompt_versions", id, { status: "published", published_at: nowIso() }))!;
  publishedCache = null;
  return out;
}

/** Rollback = publish a new version whose content copies an older one, keeping history linear. */
export async function rollbackTo(version: number, by: string): Promise<PromptVersionRow> {
  const source = await getVersion(version);
  if (!source) throw new AppError("Version not found.", 404);
  const store = db();
  await store.removeWhere("prompt_versions", { status: "draft" });
  const draft = await store.insert("prompt_versions", {
    id: uuid(),
    version: await nextVersion(),
    status: "draft",
    instructions: source.instructions,
    traits: source.traits,
    notes: `Rollback to v${version}`,
    created_by: by,
    created_at: nowIso(),
    published_at: null,
  });
  return publish(draft.id);
}

export function clearPersonalityCache() {
  publishedCache = null;
}
