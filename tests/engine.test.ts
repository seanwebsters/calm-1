import { beforeEach, describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { freshStore, lastUserText, useFakeLlm, FakeLlm } from "./helpers";
import { setLlm } from "@/lib/llm";
import { createSimulatorUser } from "@/lib/users/service";
import { handleInbound, scrubUrls, toParams } from "@/lib/engine/turn";
import { createContent } from "@/lib/content/service";
import { updateSettings } from "@/lib/settings";
import { processJobs } from "@/lib/jobs/queue";
import "@/lib/jobs/handlers";

async function onboarded(memory = false) {
  const u = await createSimulatorUser({ label: "T", countryCode: "44" });
  await handleInbound({ user: u, channel: "simulator", text: "hi", kind: "text" });
  await handleInbound({ user: (await db().get("users", u.id))!, channel: "simulator", text: memory ? "2" : "1", kind: "text" });
  return (await db().get("users", u.id))!;
}
const say = async (userId: string, text: string) => handleInbound({ user: (await db().get("users", userId))!, channel: "simulator", text, kind: "text" });

describe("conversation engine", () => {
  beforeEach(() => freshStore());

  it("never calls the model before consent", async () => {
    const llm = useFakeLlm();
    const u = await createSimulatorUser({ label: "T" });
    const r1 = await handleInbound({ user: u, channel: "simulator", text: "I'm stressed", kind: "text" });
    expect(r1.debug.path).toBe("onboarding");
    const r2 = await say(u.id, "what?");
    expect(r2.replies[0]!.text).toMatch(/Reply \*1\*/);
    expect(llm.requests).toHaveLength(0);
  });

  it("answers a substantive first message once consent is given", async () => {
    const llm = useFakeLlm({ reply: (req) => `echo:${lastUserText(req)}` });
    const u = await createSimulatorUser({ label: "T" });
    await handleInbound({ user: u, channel: "simulator", text: "I'm feeling really overwhelmed today.", kind: "text" });
    const r = await say(u.id, "1");
    expect(r.replies.at(-1)!.text).toBe("echo:I'm feeling really overwhelmed today.");
    expect(llm.replyRequests()).toHaveLength(1);
  });

  it("still gives crisis resources before consent", async () => {
    const llm = useFakeLlm();
    const u = await createSimulatorUser({ label: "T" });
    const r = await handleInbound({ user: u, channel: "simulator", text: "I'm going to kill myself tonight", kind: "text" });
    expect(r.replies[0]!.text).toContain("999");
    expect(r.replies[1]!.text).toContain("I'm Calm-1");
    expect(llm.requests).toHaveLength(0);
    expect(await db().count("safety_events", { where: { user_id: u.id, severity: "critical" } })).toBe(1);
  });

  it("persists the conversation encrypted at rest", async () => {
    useFakeLlm({ reply: () => "Hello there" });
    const u = await onboarded();
    await say(u.id, "secret worry about my landlord");
    const rows = await db().find("messages", { where: { user_id: u.id } });
    expect(rows.length).toBeGreaterThan(4);
    for (const r of rows) expect(r.content_enc ?? "").not.toContain("landlord");
    expect(rows.some((r) => r.direction === "outbound" && r.model && r.latency_ms !== null && r.output_tokens)).toBe(true);
  });

  it("keeps history in order and sends prior turns to the model", async () => {
    const llm = useFakeLlm({ reply: (req) => `n=${req.messages.length}` });
    const u = await onboarded();
    await say(u.id, "one");
    await say(u.id, "two");
    const req = llm.replyRequests().at(-1)!;
    expect(req.messages.map((m) => (typeof m.content === "string" ? m.content : ""))).toEqual(["hi\n\none", "n=1", "two"]);
  });

  it("handles Claude API errors gracefully", async () => {
    const f = new FakeLlm();
    f.create = async () => {
      throw new Anthropic.InternalServerError(500, { type: "error" }, "boom", new Headers());
    };
    setLlm(f);
    const u = await onboarded();
    const r = await say(u.id, "hello");
    expect(r.debug.path).toBe("error");
    expect(r.replies[0]!.text).toMatch(/can't reply properly/);
    expect((await db().get("conversations", r.conversationId))!.had_error).toBe(true);
  });

  it("uses crisis fallback when the model fails on a high-risk message", async () => {
    const f = new FakeLlm();
    f.create = async (req) => {
      if (req.jsonSchema) return FakeLlm.prototype.create.call(new FakeLlm(), req);
      throw new Error("timeout");
    };
    setLlm(f);
    const u = await onboarded();
    const r = await say(u.id, "I want to die");
    expect(r.replies[0]!.text).toContain("116 123");
  });

  it("removes links that aren't in the verified catalogue", async () => {
    await createContent({ title: "Approved", description: "", category: "sleep", duration_minutes: 10, url: "https://www.calm.com/approved", language: "en", available: true, verified: true, tags: ["sleep"] });
    expect(scrubUrls("Try https://www.calm.com/approved or https://evil.example/x.", new Set(["https://www.calm.com/approved"]))).toEqual({ text: "Try https://www.calm.com/approved or", removed: 1 });
    useFakeLlm({ reply: () => "Have a look at https://made-up.example/sleep-story" });
    const u = await onboarded();
    const r = await say(u.id, "help me sleep");
    expect(r.replies[0]!.text).not.toContain("made-up");
    expect(r.debug.removedUrls).toBe(1);
  });

  it("recommends only verified, available catalogue items", async () => {
    await createContent({ title: "Verified sleep", description: "", category: "sleep", duration_minutes: 10, url: "https://www.calm.com/a", language: "en", available: true, verified: true, tags: ["sleep", "racing mind"] });
    await createContent({ title: "Unverified sleep", description: "", category: "sleep", duration_minutes: 10, url: "https://www.calm.com/b", language: "en", available: true, verified: false, tags: ["sleep"] });
    await createContent({ title: "Unavailable sleep", description: "", category: "sleep", duration_minutes: 10, url: "https://www.calm.com/c", language: "en", available: false, verified: true, tags: ["sleep"] });
    let toolResult = "";
    useFakeLlm({
      reply: (req, round) => {
        if (round === 0) return { blocks: [{ type: "tool_use", id: "t1", name: "search_calm_content", input: { query: "sleep racing mind", category: "sleep" } }] };
        const last = req.messages.at(-1)!;
        toolResult = Array.isArray(last.content) ? String((last.content[0] as { content: string }).content) : "";
        return "Try Verified sleep: https://www.calm.com/a";
      },
    });
    const u = await onboarded();
    const r = await say(u.id, "can't sleep");
    expect(toolResult).toContain("Verified sleep");
    expect(toolResult).not.toContain("Unverified");
    expect(toolResult).not.toContain("Unavailable");
    expect(r.replies[0]!.text).toContain("https://www.calm.com/a");
  });

  it("asks before turning on the journal", async () => {
    useFakeLlm({
      reply: (req, round) => {
        const confirm = /yes/i.test(lastUserText(req));
        if (round === 0) return { blocks: [{ type: "tool_use", id: "t", name: "save_journal_entry", input: { text: "Went for a walk", user_confirmed_journal: confirm } }] };
        return "ok";
      },
    });
    const u = await onboarded();
    const r1 = await say(u.id, "save to my journal: went for a walk");
    expect(r1.debug.tools[0]).toMatchObject({ status: "denied", summary: "journal:needs_consent" });
    expect(await db().count("journal_entries", { where: { user_id: u.id } })).toBe(0);
    const r2 = await say(u.id, "yes please");
    expect(r2.debug.tools[0]).toMatchObject({ status: "ok" });
    expect(await db().count("journal_entries", { where: { user_id: u.id } })).toBe(1);
  });

  it("denies tools outside the safety allow-list", async () => {
    useFakeLlm({ reply: (_r, round) => (round === 0 ? { blocks: [{ type: "tool_use", id: "t", name: "search_calm_content", input: { query: "x", category: "any" } }] } : "I'm here.") });
    const u = await onboarded();
    const r = await say(u.id, "I want to die");
    expect(r.debug.tools[0]).toMatchObject({ status: "denied" });
    expect(r.replies[0]!.text).toContain("116 123");
  });

  it("rate limits bursts", async () => {
    useFakeLlm();
    const u = await onboarded();
    let limited = 0;
    for (let i = 0; i < 14; i++) if ((await say(u.id, `msg ${i}`)).debug.path === "limited") limited++;
    expect(limited).toBeGreaterThan(0);
  });

  it("enforces the daily cost cap", async () => {
    await updateSettings({ ai: { dailyCostLimitUsd: 0.000001 } }, null);
    const llm = useFakeLlm();
    const u = await onboarded();
    await say(u.id, "first");
    const r = await say(u.id, "second");
    expect(r.debug.path).toBe("limited");
    expect(llm.replyRequests()).toHaveLength(1);
  });

  it("reports when Claude isn't configured instead of faking a reply", async () => {
    setLlm(undefined);
    const u = await onboarded();
    const r = await say(u.id, "hello");
    expect(r.debug.error).toMatch(/not configured/);
    expect(r.replies).toHaveLength(0);
  });

  it("memory commands: list, forget one, forget all", async () => {
    useFakeLlm({ extract: () => ({ memories: [{ action: "create", existing_id: null, kind: "name", text: "Likes to be called Sam", event_date: null, confidence: 0.95, sensitive_category: "none" }] }) });
    const u = await onboarded(true);
    await say(u.id, "call me Sam");
    await processJobs("t", 10);
    expect((await say(u.id, "memory")).replies[0]!.text).toContain("1. Likes to be called Sam");
    expect((await say(u.id, "forget 1")).replies[0]!.text).toContain("Forgotten");
    expect(await db().count("memories", { where: { user_id: u.id, status: "active" } })).toBe(0);
    const del = await db().findOne("memories", { where: { user_id: u.id } });
    expect(del!.content_enc).toBe("");
  });

  it("filters commands out of model history", () => {
    const h = [
      { id: "1", seq: 1, direction: "inbound" as const, kind: "text" as const, text: "hi", at: "" },
      { id: "2", seq: 2, direction: "outbound" as const, kind: "system" as const, text: "welcome", at: "" },
      { id: "3", seq: 3, direction: "inbound" as const, kind: "text" as const, text: "1", at: "" },
      { id: "4", seq: 4, direction: "outbound" as const, kind: "system" as const, text: "thanks", at: "" },
      { id: "5", seq: 5, direction: "inbound" as const, kind: "text" as const, text: "yes", at: "" },
    ];
    expect(toParams(h)).toEqual([{ role: "user", content: "hi\n\nyes" }]);
  });
});
