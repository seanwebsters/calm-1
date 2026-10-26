/**
 * The approved Calm content catalogue. Only items that are both `verified`
 * (checked by a team member) and `available` are ever shown to the model,
 * and replies are scrubbed of any URL not in this catalogue.
 */
import { z } from "zod";
import { db } from "../db";
import type { ContentCategory, ContentItemRow } from "../db/types";
import { nowIso, uuid } from "../ids";

export const CATEGORIES: ContentCategory[] = ["sleep", "meditation", "breathing", "music", "stories", "movement", "focus"];

export const ContentInput = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(600).default(""),
  category: z.enum(["sleep", "meditation", "breathing", "music", "stories", "movement", "focus"]),
  duration_minutes: z.number().int().min(1).max(600).nullable().default(null),
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => u.startsWith("https://"), "Links must use https"),
  language: z.string().trim().min(2).max(10).default("en"),
  available: z.boolean().default(true),
  verified: z.boolean().default(false),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(20).default([]),
});
export type ContentInput = z.infer<typeof ContentInput>;

export async function listContent(): Promise<ContentItemRow[]> {
  return db().find("content_items", { orderBy: "updated_at", desc: true });
}

export async function createContent(input: ContentInput): Promise<ContentItemRow> {
  const v = ContentInput.parse(input);
  return db().insert("content_items", { id: uuid(), ...v, created_at: nowIso(), updated_at: nowIso() });
}

export async function updateContent(id: string, patch: Partial<ContentInput>) {
  const v = ContentInput.partial().parse(patch);
  return db().update("content_items", id, { ...v, updated_at: nowIso() });
}

export async function deleteContent(id: string) {
  await db().remove("content_items", id);
}

const STOP = new Set(["a", "an", "the", "to", "for", "and", "or", "of", "something", "me", "i", "my", "help", "with", "some", "in", "on"]);
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));

export async function searchContent(query: string, opts: { category?: ContentCategory; language?: string; limit?: number } = {}): Promise<ContentItemRow[]> {
  const items = await db().find("content_items", { where: { verified: true, available: true } });
  const q = tokens(query);
  const lang = (opts.language ?? "en").slice(0, 2);
  const scored = items
    .filter((i) => i.language.slice(0, 2) === lang)
    .filter((i) => !opts.category || i.category === opts.category)
    .map((i) => {
      const hay = new Set([...tokens(i.title), ...tokens(i.description), ...i.tags.flatMap(tokens), i.category]);
      const score = q.reduce((s, t) => s + (hay.has(t) ? (i.tags.includes(t) ? 2 : 1) : 0), 0) + (opts.category ? 1 : 0);
      return { i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit ?? 3).map((x) => x.i);
}

export async function catalogueUrls(): Promise<Set<string>> {
  const items = await db().find("content_items", { where: { verified: true, available: true }, columns: ["url"] });
  return new Set(items.map((i) => i.url));
}

/**
 * Starter rows so the content screen isn't empty. They are clearly marked as
 * examples and unverified, so Calm-1 will not recommend them until the team
 * replaces them with real, approved catalogue entries and verifies them.
 */
export const EXAMPLE_CONTENT: ContentInput[] = [
  { title: "Example – replace: wind-down sleep story", description: "Placeholder for an approved Sleep Story. Edit title, link and tags, then mark verified.", category: "sleep", duration_minutes: 25, url: "https://www.calm.com/", language: "en", available: true, verified: false, tags: ["sleep", "bedtime", "story", "wind-down"] },
  { title: "Example – replace: 10-minute body scan", description: "Placeholder for an approved body-scan meditation.", category: "meditation", duration_minutes: 10, url: "https://www.calm.com/", language: "en", available: true, verified: false, tags: ["body scan", "relax", "stress", "anxiety"] },
  { title: "Example – replace: calming breath session", description: "Placeholder for an approved breathing session.", category: "breathing", duration_minutes: 3, url: "https://www.calm.com/", language: "en", available: true, verified: false, tags: ["breathing", "panic", "anxious", "calm"] },
  { title: "Example – replace: focus soundscape", description: "Placeholder for approved focus music.", category: "focus", duration_minutes: 60, url: "https://www.calm.com/", language: "en", available: true, verified: false, tags: ["focus", "work", "study", "music"] },
];

export async function ensureExampleContent() {
  if ((await db().count("content_items")) > 0) return;
  for (const c of EXAMPLE_CONTENT) await createContent(c);
}
