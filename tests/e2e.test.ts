/**
 * The end-to-end journey from the product brief, through the real engine
 * with a scripted model: join → onboard → chat → share a future event →
 * return later → context-aware reply → breathing exercise → disable memory →
 * opt into a check-in → opt out → delete data.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { freshStore, lastUserText, useFakeLlm } from "./helpers";
import { createSimulatorUser } from "@/lib/users/service";
import { handleInbound, completeDeletion } from "@/lib/engine/turn";
import { processJobs } from "@/lib/jobs/queue";
import "@/lib/jobs/handlers";
import { localDateString } from "@/lib/checkins/time";
import { runDueCheckins } from "@/lib/checkins/service";
import { open } from "@/lib/crypto";

async function say(userId: string, text: string) {
  const user = (await db().get("users", userId))!;
  const r = await handleInbound({ user, channel: "simulator", text, kind: "text" });
  await processJobs("test", 20);
  return r;
}

describe("Calm-1 end-to-end journey", () => {
  beforeEach(() => freshStore());

  it("runs the full journey", async () => {
    const tz = "Europe/London";
    const thursday = (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 3);
      return localDateString(d, tz);
    })();
    const llm = useFakeLlm({
      extract: (req) => {
        const t = lastUserText(req);
        return /presentation/i.test(t)
          ? { memories: [{ action: "create", existing_id: null, kind: "event", text: "Has a big presentation at work", event_date: thursday, confidence: 0.9, sensitive_category: "none" }] }
          : { memories: [] };
      },
      reply: (req, round) => {
        const t = lastUserText(req);
        if (/breathing/i.test(t) && round === 0) return { blocks: [{ type: "tool_use", id: "tu_1", name: "breathing_exercise", input: { style: "box" } }] };
        if (/check in on me/i.test(t) && round === 0) return { blocks: [{ type: "tool_use", id: "tu_2", name: "update_checkins", input: { action: "subscribe", kind: "morning", local_time: "08:30", frequency: "daily" } }] };
        if (round > 0) return "Done.";
        if (/morning/i.test(t) && /presentation/i.test(req.context ?? "")) return "Morning. Is the big presentation coming up?";
        return "Sounds like you've got a lot on your mind. Want to talk it through?";
      },
    });

    // 1–2. Join and onboard
    const user = await createSimulatorUser({ label: "Journey", countryCode: "44", timezone: tz });
    const welcome = await say(user.id, "hi");
    expect(welcome.replies[0]!.text).toContain("I'm Calm-1");
    expect(llm.requests).toHaveLength(0); // no AI before consent
    const consent = await say(user.id, "2");
    expect(consent.replies[0]!.text).toMatch(/Memory is on/);
    expect((await db().get("users", user.id))!.status).toBe("active");

    // 3. Conversation
    const r1 = await say(user.id, "I'm feeling really overwhelmed today.");
    expect(r1.debug.path).toBe("ai");
    expect(r1.replies[0]!.text).toMatch(/lot on your mind/);

    // 4. Share a future event → background extraction stores it
    await say(user.id, "I've got a huge presentation on Thursday.");
    const mems = await db().find("memories", { where: { user_id: user.id, status: "active" } });
    expect(mems).toHaveLength(1);
    expect(mems[0]!.event_date).toBe(thursday);
    expect(open(mems[0]!.content_enc)).toBe("Has a big presentation at work");

    // 5–6. Return later (new session) → memory is in context and used
    vi.useFakeTimers({ now: Date.now() + 10 * 3600_000, toFake: ["Date"] });
    const r2 = await say(user.id, "Morning.");
    vi.useRealTimers();
    expect(r2.debug.memoriesUsed.some((m) => m.kind === "event")).toBe(true);
    expect(r2.replies[0]!.text).toMatch(/presentation/);
    expect(r2.conversationId).not.toBe(r1.conversationId);

    // 7. Breathing exercise via the tool registry
    const r3 = await say(user.id, "Can we do some breathing?");
    expect(r3.debug.tools[0]).toMatchObject({ name: "breathing_exercise", status: "ok" });
    expect(await db().count("tool_invocations", { where: { user_id: user.id } })).toBe(1);

    // 8. Disable memory → no retrieval, no extraction
    const off = await say(user.id, "memory off");
    expect(off.debug.path).toBe("command");
    const before = llm.requests.length;
    const r4 = await say(user.id, "Another thing about work");
    expect(r4.debug.memoriesUsed).toHaveLength(0);
    expect(llm.requests.slice(before).some((r) => r.jsonSchema && r.system.startsWith("You decide"))).toBe(false);

    // 9. Opt into a check-in (consent recorded, schedule created, delivery works)
    const r5 = await say(user.id, "Could you check in on me every morning?");
    expect(r5.debug.tools[0]).toMatchObject({ name: "update_checkins", status: "ok" });
    const pref = await db().findOne("checkin_preferences", { where: { user_id: user.id } });
    expect(pref?.local_time).toBe("08:30");
    const sched = (await db().findOne("checkin_schedules", { where: { user_id: user.id } }))!;
    const stats = await runDueCheckins(new Date(new Date(sched.next_run_at).getTime() + 1000));
    expect(stats.sent).toBe(1);

    // 10. Opt out and delete
    const stop = await say(user.id, "STOP");
    expect(stop.replies[0]!.text).toMatch(/stopped Calm-1/);
    expect(await db().count("checkin_schedules", { where: { user_id: user.id } })).toBe(0);
    const reminder = await say(user.id, "hello?");
    expect(reminder.debug.path).toBe("stopped");
    const del = await say(user.id, "CONFIRM DELETE");
    expect(del.deleted).toBe(true);
    await completeDeletion(user.id, "simulator");
    expect(await db().get("users", user.id)).toBeNull();
    expect(await db().count("messages", { where: { user_id: user.id } })).toBe(0);
    expect(await db().count("memories", { where: { user_id: user.id } })).toBe(0);
    expect(await db().count("deletion_requests", { where: { anon_id: user.anon_id, status: "completed" } })).toBe(1);
  });
});
