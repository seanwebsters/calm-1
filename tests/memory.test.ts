import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { freshStore, useFakeLlm } from "./helpers";
import { createSimulatorUser, setPreferences } from "@/lib/users/service";
import { extractAndStore, filterCandidates, listMemories, selectMemories, type MemoryCandidate } from "@/lib/memory/service";

const cand = (p: Partial<MemoryCandidate>): MemoryCandidate => ({ action: "create", existing_id: null, kind: "context", text: "Has a dog called Max", event_date: null, confidence: 0.9, sensitive_category: "none", ...p });

describe("memory", () => {
  beforeEach(() => freshStore());

  it("never stores special-category or low-confidence candidates", () => {
    const r = filterCandidates(
      [
        cand({}),
        cand({ text: "Takes sertraline", sensitive_category: "health" }),
        cand({ text: "Is gay", sensitive_category: "sexual_orientation_or_life" }),
        cand({ text: "Maybe likes jazz", confidence: 0.3 }),
        cand({ kind: "event", text: "Exam", event_date: null }),
        cand({ action: "update", existing_id: "nope" }),
        cand({ action: "none" }),
      ],
      new Set(),
    );
    expect(r.accepted.map((c) => c.text)).toEqual(["Has a dog called Max"]);
    expect(r.rejected.map((x) => x.reason)).toEqual(["sensitive: health", "sensitive: sexual_orientation_or_life", "low confidence", "event without a date", "unknown memory to update"]);
  });

  it("does nothing when memory is disabled", async () => {
    const llm = useFakeLlm({ extract: () => ({ memories: [cand({})] }) });
    const u = await createSimulatorUser({ label: "T" });
    expect(await extractAndStore(u.id, "m1", "I have a dog called Max", [])).toBeNull();
    expect(llm.requests).toHaveLength(0);
    expect(await db().count("memories", {})).toBe(0);
  });

  it("stores encrypted memories with events expiring after the date", async () => {
    useFakeLlm({ extract: () => ({ memories: [cand({ kind: "event", text: "Big presentation", event_date: "2030-01-10" }), cand({ text: "On antidepressants", sensitive_category: "health" })] }) });
    const u = await createSimulatorUser({ label: "T" });
    await setPreferences(u.id, { memory_enabled: true });
    await extractAndStore(u.id, "m1", "...", []);
    const rows = await db().find("memories", { where: { user_id: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.content_enc).not.toContain("presentation");
    expect(rows[0]!.expires_at! > "2030-01-10").toBe(true);
    expect((await listMemories(u.id))[0]!.text).toBe("Big presentation");
    expect(await db().count("memory_events", { where: { action: "rejected" } })).toBe(1);
  });

  it("retrieves profile, upcoming events and relevant memories only", () => {
    const m = (id: string, kind: MemoryCandidate["kind"], text: string, event_date: string | null = null) => ({ id, kind, text, event_date, created_at: "", confidence: 1 });
    const all = [
      m("1", "name", "Likes to be called Sam"),
      m("2", "event", "Big presentation", "2026-10-29"),
      m("3", "event", "Dentist", "2026-12-01"),
      m("4", "event", "Party", "2026-10-25"),
      m("5", "technique", "Box breathing helps when stressed"),
      m("6", "context", "Has a dog called Max"),
    ];
    const picked = selectMemories(all, "feeling stressed this morning", "2026-10-26", 6);
    expect(picked.map((p) => p.id)).toEqual(["1", "4", "2", "5"]);
    expect(picked.find((p) => p.id === "2")!.days_until).toBe(3);
    expect(selectMemories(all, "my dog is being silly", "2026-10-26", 6).map((p) => p.id)).toContain("6");
    expect(selectMemories(all, "x", "2026-10-26", 0)).toEqual([]);
  });
});
