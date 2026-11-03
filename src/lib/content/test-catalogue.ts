/**
 * Placeholder "Calm app" content for the test chat, so recommendations can
 * be tried end to end. Every item is tagged `test-content`, its link opens a
 * placeholder page on this site (/calm/<slug>), and the UI labels it as a
 * test placeholder. Replace with the real approved catalogue before launch.
 */
import { db } from "../db";
import type { ContentCategory } from "../db/types";
import { env } from "../env";
import { nowIso, uuid } from "../ids";

export const TEST_TAG = "test-content";

export const TEST_ITEMS: { slug: string; title: string; description: string; category: ContentCategory; minutes: number; tags: string[]; kind: string }[] = [
  { slug: "lighthouse-keepers-night", title: "The Lighthouse Keeper's Night", description: "A slow, gentle sleep story by the sea.", category: "sleep", minutes: 28, kind: "Sleep Story", tags: ["sleep", "bedtime", "story", "insomnia", "racing mind", "night"] },
  { slug: "slow-train-highlands", title: "A Slow Train Through the Highlands", description: "Drift off on a quiet overnight journey.", category: "sleep", minutes: 32, kind: "Sleep Story", tags: ["sleep", "bedtime", "story", "travel", "night"] },
  { slug: "rain-on-lavender", title: "Rain on the Lavender Fields", description: "Soft rain and a meandering story to help you rest.", category: "stories", minutes: 25, kind: "Sleep Story", tags: ["sleep", "rain", "story", "relax"] },
  { slug: "wind-down-after-work", title: "Wind Down After Work", description: "Let the day go before the evening begins.", category: "sleep", minutes: 15, kind: "Wind Down", tags: ["sleep", "evening", "work", "stress", "wind-down"] },
  { slug: "calming-anxiety-day-1", title: "7 Days of Calming Anxiety: Day 1", description: "A short guided meditation for anxious moments.", category: "meditation", minutes: 10, kind: "Meditation", tags: ["anxiety", "anxious", "worry", "panic", "stress", "calm"] },
  { slug: "rest-before-a-big-day", title: "Rest Before a Big Day", description: "Settle nerves before a presentation, interview or exam.", category: "meditation", minutes: 8, kind: "Meditation", tags: ["presentation", "interview", "exam", "nervous", "nerves", "work", "stress"] },
  { slug: "body-scan-for-sleep", title: "Body Scan for Sleep", description: "Release tension from head to toe.", category: "meditation", minutes: 12, kind: "Meditation", tags: ["body scan", "sleep", "tension", "relax"] },
  { slug: "daily-calm-letting-go", title: "Daily Calm: Letting Go", description: "Today's 10-minute practice on loosening your grip.", category: "meditation", minutes: 10, kind: "Daily Calm", tags: ["daily", "letting go", "overwhelmed", "stress", "mindfulness"] },
  { slug: "breathe-through-stress", title: "Breathe Through Stress", description: "A 5-minute guided breathing session.", category: "breathing", minutes: 5, kind: "Breathwork", tags: ["breathing", "breath", "stress", "overwhelmed", "calm down"] },
  { slug: "deep-focus-piano", title: "Deep Focus Piano", description: "Gentle piano to help you concentrate.", category: "focus", minutes: 60, kind: "Music", tags: ["focus", "work", "study", "concentrate", "music"] },
  { slug: "ocean-waves-at-dusk", title: "Ocean Waves at Dusk", description: "An endless soundscape of waves.", category: "music", minutes: 45, kind: "Soundscape", tags: ["sounds", "nature", "ocean", "sleep", "relax", "music"] },
  { slug: "gentle-evening-stretch", title: "Gentle Evening Stretch", description: "Easy movement to release the day.", category: "movement", minutes: 8, kind: "Movement", tags: ["stretch", "movement", "body", "evening", "tension"] },
];

export function testContentUrl(slug: string): string {
  const base = env.appUrl && !env.appUrl.includes("localhost") ? env.appUrl.replace(/\/$/, "") : process.env.VERCEL ? "https://calm-1.vercel.app" : "http://localhost:3000";
  return `${base}/calm/${slug}`;
}

/** Seed the placeholder catalogue once (idempotent). */
export async function ensureTestContent() {
  const store = db();
  const existing = await store.find("content_items", { columns: ["tags"] });
  if (existing.some((r) => r.tags?.includes(TEST_TAG))) return;
  for (const t of TEST_ITEMS) {
    await store.insert("content_items", {
      id: uuid(),
      title: t.title,
      description: `${t.kind} · ${t.description}`,
      category: t.category,
      duration_minutes: t.minutes,
      url: testContentUrl(t.slug),
      language: "en",
      available: true,
      verified: true,
      tags: [...t.tags, TEST_TAG],
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }
}
