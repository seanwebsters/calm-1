import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { freshStore } from "./helpers";
import { createSimulatorUser, findOrCreateWhatsappUser } from "@/lib/users/service";
import { nextRunAt, runDueCheckins, setPaused, subscribe, unsubscribe, ensureTemplates } from "@/lib/checkins/service";
import { inQuietHours, zonedToUtc } from "@/lib/checkins/time";
import { updateSettings } from "@/lib/settings";

async function activeUser() {
  const u = await createSimulatorUser({ label: "T", timezone: "Europe/London" });
  return (await db().update("users", u.id, { status: "active", onboarding_step: "done" }))!;
}

describe("check-in scheduling", () => {
  beforeEach(() => freshStore());
  afterEach(() => vi.unstubAllGlobals());

  it("computes the next run in the user's timezone across DST", () => {
    const pref = { local_time: "08:30", timezone: "Europe/London", frequency: "daily" as const, weekday: null };
    // 25 Oct 2026 is the day UK clocks go back (BST → GMT).
    expect(nextRunAt(pref, new Date("2026-10-24T12:00:00Z")).toISOString()).toBe("2026-10-25T08:30:00.000Z");
    expect(nextRunAt(pref, new Date("2026-10-23T12:00:00Z")).toISOString()).toBe("2026-10-24T07:30:00.000Z");
    expect(nextRunAt({ ...pref, timezone: "America/New_York" }, new Date("2026-07-01T00:00:00Z")).toISOString()).toBe("2026-07-01T12:30:00.000Z");
    expect(zonedToUtc(2026, 3, 29, 8, 0, "Europe/London").toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });

  it("skips weekends for weekday check-ins and honours weekly days", () => {
    const fri = new Date("2026-10-23T12:00:00Z"); // Friday
    expect(nextRunAt({ local_time: "09:00", timezone: "UTC", frequency: "weekdays", weekday: null }, fri).toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(nextRunAt({ local_time: "09:00", timezone: "UTC", frequency: "weekly", weekday: 3 }, fri).toISOString()).toBe("2026-10-28T09:00:00.000Z");
  });

  it("rejects times in quiet hours", async () => {
    expect(inQuietHours("23:30", "22:30", "07:00")).toBe(true);
    expect(inQuietHours("06:59", "22:30", "07:00")).toBe(true);
    expect(inQuietHours("07:00", "22:30", "07:00")).toBe(false);
    const u = await activeUser();
    await expect(subscribe(u, { kind: "bedtime", local_time: "23:30" }, "simulator")).rejects.toThrow(/quiet hours/);
  });

  it("subscribing records consent; delivery respects pause and opt-out", async () => {
    const u = await activeUser();
    const pref = await subscribe(u, { kind: "morning", local_time: "08:30" }, "simulator");
    expect(await db().count("user_consents", { where: { user_id: u.id, kind: "checkins", granted: true } })).toBe(1);
    const due = async () => runDueCheckins(new Date(new Date((await db().findOne("checkin_schedules", { where: { preference_id: pref.id } }))!.next_run_at).getTime() + 1000));

    expect((await due()).sent).toBe(1);
    await setPaused(u.id, true);
    expect((await due()).skipped).toBe(1);
    await setPaused(u.id, false);
    expect((await due()).sent).toBe(1);

    await unsubscribe(u, "simulator");
    expect(await db().count("checkin_schedules", { where: { user_id: u.id } })).toBe(0);
    expect(await db().count("user_consents", { where: { user_id: u.id, kind: "checkins", granted: false } })).toBe(1);
    expect((await runDueCheckins(new Date(Date.now() + 9 * 86400_000))).sent).toBe(0);
  });

  it("enforces the weekly cap", async () => {
    await updateSettings({ checkins: { maxPerWeek: 1 } }, null);
    const u = await activeUser();
    const pref = await subscribe(u, { kind: "morning" }, "simulator");
    const run = async () => runDueCheckins(new Date(new Date((await db().findOne("checkin_schedules", { where: { preference_id: pref.id } }))!.next_run_at).getTime() + 1000));
    expect((await run()).sent).toBe(1);
    expect((await run()).skipped).toBe(1);
  });

  it("outside the 24h window, never sends without an approved template", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "wamid.t" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await ensureTemplates();
      const { user } = await findOrCreateWhatsappUser("447700900999");
      const u = (await db().update("users", user.id, { status: "active", onboarding_step: "done", last_inbound_at: new Date(Date.now() - 3 * 86400_000).toISOString() }))!;
      const pref = await subscribe(u, { kind: "morning" }, "whatsapp");
      const when = async () => new Date(new Date((await db().findOne("checkin_schedules", { where: { preference_id: pref.id } }))!.next_run_at).getTime() + 1000);
      expect((await runDueCheckins(await when())).failed).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
      const d = (await db().findOne("checkin_deliveries", { where: { user_id: u.id } }))!;
      expect(d.error).toMatch(/no approved template/);

      await db().updateWhere("message_templates", { name: "calm1_morning_checkin" }, { meta_status: "approved" });
      expect((await runDueCheckins(await when())).sent).toBe(1);
      const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
      expect(body).toMatchObject({ type: "template", template: { name: "calm1_morning_checkin" } });
    } finally {
      process.env.WHATSAPP_ACCESS_TOKEN = "";
      process.env.WHATSAPP_PHONE_NUMBER_ID = "";
    }
  });
});
