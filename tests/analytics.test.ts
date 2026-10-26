import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { freshStore } from "./helpers";
import { overviewMetrics, analyticsReport, returningRate, periodFromDays } from "@/lib/analytics/metrics";
import { createSimulatorUser } from "@/lib/users/service";
import { uuid } from "@/lib/ids";
import type { Channel } from "@/lib/db/types";

const DAY = 86400_000;
async function user(channel: Channel, joinedDaysAgo: number) {
  const u = await createSimulatorUser({ label: "x", channel: channel === "whatsapp" ? "simulator" : channel });
  await db().update("users", u.id, { channel, onboarding_step: "done", status: "active", created_at: new Date(Date.now() - joinedDaysAgo * DAY).toISOString() });
  await db().insert("user_consents", { id: uuid(), user_id: u.id, kind: "privacy_notice", granted: true, notice_version: "x", source: "simulator", created_at: new Date(Date.now() - joinedDaysAgo * DAY).toISOString() });
  return u.id;
}
async function msg(userId: string, daysAgo: number, direction: "inbound" | "outbound" = "inbound") {
  const at = new Date(Date.now() - daysAgo * DAY).toISOString();
  await db().insert("messages", { id: uuid(), conversation_id: "c", user_id: userId, seq: 0, direction, kind: "text", content_enc: null, wa_message_id: null, status: "received", latency_ms: direction === "outbound" ? 2000 : null, input_tokens: null, output_tokens: null, model: direction === "outbound" ? "m" : null, prompt_version: null, safety_severity: "none", error: null, sent_at: at, created_at: at });
}

describe("analytics", () => {
  beforeEach(() => freshStore());

  it("computes overview metrics from records, separated by channel", async () => {
    const a = await user("whatsapp", 20);
    const b = await user("whatsapp", 3);
    const demo = await user("demo", 3);
    await msg(a, 15); // before period → a is returning
    await msg(a, 0.2);
    await msg(a, 0.2, "outbound");
    await msg(b, 2);
    await msg(demo, 0.1);
    const m = await overviewMetrics(periodFromDays(14), ["whatsapp"]);
    expect(m.optedInUsers.value).toBe(2);
    expect(m.dailyActiveUsers.value).toBe(1);
    expect(m.messages.value).toBe(3);
    expect(m.returningRate).toMatchObject({ value: 50, activeUsers: 2, returningUsers: 1 });
    expect(m.series).toHaveLength(14);
    expect(m.series.reduce((s, d) => s + d.inbound + d.outbound, 0)).toBe(3);
    const d = await overviewMetrics(periodFromDays(14), ["demo"]);
    expect(d.messages.value).toBe(1);
  });

  it("returning rate is null with no activity", async () => {
    expect((await returningRate(periodFromDays(7), ["whatsapp"])).rate).toBeNull();
  });

  it("report: active users, messages per active user, latency and cost", async () => {
    const a = await user("whatsapp", 40);
    await msg(a, 1);
    await msg(a, 1, "outbound");
    await msg(a, 10);
    await db().insert("api_costs", { id: uuid(), provider: "anthropic", model: "m", purpose: "reply", channel: "whatsapp", conversation_id: null, user_id: a, input_tokens: 1, output_tokens: 1, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0.5, estimated: true, latency_ms: 1, created_at: new Date(Date.now() - DAY).toISOString() });
    const r = await analyticsReport(periodFromDays(30), ["whatsapp"]);
    expect(r.mau.value).toBe(1);
    expect(r.wau.value).toBe(1);
    expect(r.messagesPerActiveUser.value).toBe(3);
    expect(r.avgLatencyMs.value).toBe(2000);
    expect(r.totalCost.value).toBeCloseTo(0.5);
    expect(r.costPerActiveUser.value).toBeCloseTo(0.5);
    expect(r.cohorts).toHaveLength(6);
  });
});
