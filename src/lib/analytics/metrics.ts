/**
 * Analytics computed from application records – no invented numbers. All
 * figures are aggregates; nothing here returns message content or user ids.
 *
 * Channels are kept separate: production (whatsapp), simulator and demo
 * data are never mixed unless explicitly requested, and the UI labels any
 * non-production series.
 */
import { db } from "../db";
import type { Channel } from "../db/types";
import { change } from "../utils";

export interface Period {
  from: Date;
  to: Date;
}

export function periodFromDays(days: number, end = new Date()): Period {
  return { from: new Date(end.getTime() - days * 86400_000), to: end };
}

export function previousPeriod(p: Period): Period {
  const len = p.to.getTime() - p.from.getTime();
  return { from: new Date(p.from.getTime() - len), to: p.from };
}

const DAY = 86400_000;
const iso = (d: Date) => d.toISOString();
const dayKey = (s: string) => s.slice(0, 10);

export interface Metric {
  value: number | null;
  previous: number | null;
  change: number | null;
}

const metric = (value: number | null, previous: number | null): Metric => ({ value, previous, change: value === null || previous === null ? null : change(value, previous) });

async function loadBase(channels: Channel[], since: Date) {
  const store = db();
  const users = await store.find("users", { in: { channel: channels }, columns: ["id", "channel", "created_at", "status", "onboarding_step", "last_active_at"] });
  const ids = new Set(users.map((u) => u.id));
  const messages = (await store.find("messages", { gte: { created_at: iso(since) }, columns: ["user_id", "direction", "created_at", "latency_ms", "kind", "conversation_id", "model"] })).filter((m) => ids.has(m.user_id));
  return { users, ids, messages };
}

export interface OverviewMetrics {
  optedInUsers: Metric;
  dailyActiveUsers: Metric;
  messages: Metric;
  returningRate: Metric & { activeUsers: number; returningUsers: number };
  aiCostUsd: Metric;
  series: { date: string; inbound: number; outbound: number }[];
  hasData: boolean;
}

/** Users whose latest privacy-notice consent before `at` is a grant (STOP records a withdrawal). */
async function optedInAt(channels: Channel[], at: Date): Promise<number> {
  const store = db();
  const ids = new Set((await store.find("users", { in: { channel: channels }, columns: ["id"] })).map((u) => u.id));
  const consents = await store.find("user_consents", { where: { kind: "privacy_notice" }, lt: { created_at: iso(at) }, orderBy: "created_at", columns: ["user_id", "granted", "created_at"] });
  const latest = new Map<string, boolean>();
  for (const c of consents) if (ids.has(c.user_id)) latest.set(c.user_id, c.granted);
  return [...latest.values()].filter(Boolean).length;
}

function activeUsers(messages: { user_id: string; direction: string; created_at: string }[], from: Date, to: Date): Set<string> {
  const s = new Set<string>();
  for (const m of messages) if (m.direction === "inbound" && m.created_at >= iso(from) && m.created_at < iso(to)) s.add(m.user_id);
  return s;
}

export async function overviewMetrics(p: Period, channels: Channel[] = ["whatsapp"]): Promise<OverviewMetrics> {
  const prev = previousPeriod(p);
  const lookback = new Date(Math.min(prev.from.getTime(), p.to.getTime() - 2 * DAY));
  const { messages, ids } = await loadBase(channels, lookback);
  const store = db();

  const inP = (from: Date, to: Date) => messages.filter((m) => m.created_at >= iso(from) && m.created_at < iso(to));

  const optedNow = await optedInAt(channels, p.to);
  const optedPrev = await optedInAt(channels, p.from);

  const dau = activeUsers(messages, new Date(p.to.getTime() - DAY), p.to).size;
  const dauPrev = activeUsers(messages, new Date(p.to.getTime() - 2 * DAY), new Date(p.to.getTime() - DAY)).size;

  const msgs = inP(p.from, p.to).length;
  const msgsPrev = inP(prev.from, prev.to).length;

  const returning = await returningRate(p, channels, ids);
  const returningPrev = await returningRate(prev, channels, ids);

  const costs = await store.find("api_costs", { gte: { created_at: iso(prev.from) }, in: { channel: channels }, columns: ["cost_usd", "created_at"] });
  const costIn = (a: Date, b: Date) => costs.filter((c) => c.created_at >= iso(a) && c.created_at < iso(b)).reduce((s, c) => s + Number(c.cost_usd), 0);

  const days = Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / DAY));
  const series: OverviewMetrics["series"] = [];
  const byDay = new Map<string, { inbound: number; outbound: number }>();
  for (const m of inP(p.from, p.to)) {
    const k = dayKey(m.created_at);
    const e = byDay.get(k) ?? { inbound: 0, outbound: 0 };
    e[m.direction as "inbound" | "outbound"]++;
    byDay.set(k, e);
  }
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(p.to.getTime() - i * DAY).toISOString());
    series.push({ date: k, ...(byDay.get(k) ?? { inbound: 0, outbound: 0 }) });
  }

  return {
    optedInUsers: metric(optedNow, optedPrev),
    dailyActiveUsers: metric(dau, dauPrev),
    messages: metric(msgs, msgsPrev),
    returningRate: { ...metric(returning.rate, returningPrev.rate), activeUsers: returning.active, returningUsers: returning.returning },
    aiCostUsd: metric(costIn(p.from, p.to), costIn(prev.from, prev.to)),
    series,
    hasData: ids.size > 0,
  };
}

/**
 * Returning user rate = of the users who sent at least one message in the
 * period, the share who had also sent a message before the period began.
 */
export async function returningRate(p: Period, channels: Channel[], ids?: Set<string>) {
  const store = db();
  const userIds = ids ?? new Set((await store.find("users", { in: { channel: channels }, columns: ["id"] })).map((u) => u.id));
  const inPeriod = (await store.find("messages", { where: { direction: "inbound" }, gte: { created_at: iso(p.from) }, lt: { created_at: iso(p.to) }, columns: ["user_id"] })).filter((m) => userIds.has(m.user_id));
  const active = new Set(inPeriod.map((m) => m.user_id));
  if (!active.size) return { rate: null as number | null, active: 0, returning: 0 };
  const before = (await store.find("messages", { where: { direction: "inbound" }, lt: { created_at: iso(p.from) }, in: { user_id: [...active] }, columns: ["user_id"] })).map((m) => m.user_id);
  const returning = new Set(before).size;
  return { rate: (returning / active.size) * 100, active: active.size, returning };
}

export interface AnalyticsReport {
  newOptedIn: Metric;
  dau: Metric;
  wau: Metric;
  mau: Metric;
  messagesPerActiveUser: Metric;
  returningRate: Metric;
  avgConversationMinutes: Metric;
  avgLatencyMs: Metric;
  p95LatencyMs: number | null;
  costPerConversation: Metric;
  costPerActiveUser: Metric;
  totalCost: Metric;
  checkinOptInRate: number | null;
  checkinOptOutRate: Metric;
  safetyPer1000: Metric;
  toolUsage: { tool: string; count: number; previous: number }[];
  breathingEngagement: Metric;
  sleepEngagement: Metric;
  safetyBySeverity: { severity: string; count: number }[];
  cohorts: { cohort: string; size: number; weeks: (number | null)[] }[];
  activeSeries: { date: string; dau: number }[];
  costSeries: { date: string; cost: number }[];
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

export async function analyticsReport(p: Period, channels: Channel[] = ["whatsapp"]): Promise<AnalyticsReport> {
  const store = db();
  const prev = previousPeriod(p);
  const lookback = new Date(Math.min(prev.from.getTime(), p.to.getTime() - 60 * DAY));
  const { users, ids, messages } = await loadBase(channels, lookback);
  const within = <T extends { created_at: string }>(rows: T[], a: Date, b: Date) => rows.filter((r) => r.created_at >= iso(a) && r.created_at < iso(b));

  const usage = (await store.find("usage_events", { gte: { created_at: iso(prev.from) }, in: { channel: channels }, columns: ["kind", "created_at", "user_id"] })) as { kind: string; created_at: string; user_id: string | null }[];
  const countKind = (kind: string, a: Date, b: Date) => within(usage, a, b).filter((u) => u.kind === kind).length;

  const active = (a: Date, b: Date) => activeUsers(messages, a, b).size;
  const end = p.to;

  const msgsPerActive = (a: Date, b: Date) => {
    const act = active(a, b);
    return act ? within(messages, a, b).length / act : null;
  };

  const convs = (await store.find("conversations", { gte: { started_at: iso(prev.from) }, in: { channel: channels }, columns: ["id", "started_at", "last_message_at", "message_count"] })) as { id: string; started_at: string; last_message_at: string; message_count: number }[];
  const convDur = (a: Date, b: Date) => mean(convs.filter((c) => c.started_at >= iso(a) && c.started_at < iso(b) && c.message_count >= 2).map((c) => (new Date(c.last_message_at).getTime() - new Date(c.started_at).getTime()) / 60000));
  const convCount = (a: Date, b: Date) => convs.filter((c) => c.started_at >= iso(a) && c.started_at < iso(b)).length;

  const latencies = (a: Date, b: Date) => within(messages, a, b).filter((m) => m.direction === "outbound" && m.latency_ms !== null && m.model).map((m) => m.latency_ms as number);

  const costs = (await store.find("api_costs", { gte: { created_at: iso(prev.from) }, in: { channel: channels }, columns: ["cost_usd", "created_at"] })) as { cost_usd: number; created_at: string }[];
  const cost = (a: Date, b: Date) => within(costs, a, b).reduce((s, c) => s + Number(c.cost_usd), 0);

  const tools = (await store.find("tool_invocations", { gte: { created_at: iso(prev.from) }, columns: ["tool", "created_at", "user_id", "status"] })).filter((t) => ids.has(t.user_id) && t.status === "ok");
  const toolNames = [...new Set(tools.map((t) => t.tool))];
  const toolCount = (name: string, a: Date, b: Date) => within(tools, a, b).filter((t) => t.tool === name).length;
  const toolUsers = (names: string[], a: Date, b: Date) => new Set(within(tools, a, b).filter((t) => names.includes(t.tool)).map((t) => t.user_id)).size;

  const safety = (await store.find("safety_events", { gte: { created_at: iso(prev.from) }, in: { channel: channels }, columns: ["severity", "created_at", "layer"] })).filter((s) => s.layer === "input");
  const inboundCount = (a: Date, b: Date) => within(messages, a, b).filter((m) => m.direction === "inbound").length;
  const safetyRate = (a: Date, b: Date) => {
    const n = inboundCount(a, b);
    return n ? (within(safety, a, b).length / n) * 1000 : null;
  };

  const optedIn = users.filter((u) => u.onboarding_step === "done" && u.status !== "deleted");
  const withCheckins = new Set((await store.find("checkin_preferences", { where: { enabled: true }, columns: ["user_id"] })).map((c) => c.user_id).filter((id) => ids.has(id)));
  const optOutRate = (a: Date, b: Date) => {
    const ins = countKind("checkin_opt_in", a, b);
    return ins ? (countKind("checkin_opt_out", a, b) / ins) * 100 : null;
  };

  const ret = await returningRate(p, channels, ids);
  const retPrev = await returningRate(prev, channels, ids);

  // Weekly cohorts by opt-in week: % of the cohort active in each later week.
  const cohorts: AnalyticsReport["cohorts"] = [];
  const weekStart = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const thisWeek = weekStart(end);
  for (let w = 5; w >= 0; w--) {
    const cStart = new Date(thisWeek.getTime() - w * 7 * DAY);
    const cEnd = new Date(cStart.getTime() + 7 * DAY);
    const members = optedIn.filter((u) => u.created_at >= iso(cStart) && u.created_at < iso(cEnd)).map((u) => u.id);
    const weeks: (number | null)[] = [];
    for (let k = 0; k <= 5; k++) {
      const s = new Date(cStart.getTime() + k * 7 * DAY);
      if (s > end || !members.length) {
        weeks.push(null);
        continue;
      }
      const act = activeUsers(messages, s, new Date(s.getTime() + 7 * DAY));
      weeks.push((members.filter((id) => act.has(id)).length / members.length) * 100);
    }
    cohorts.push({ cohort: cStart.toISOString().slice(0, 10), size: members.length, weeks });
  }

  const days = Math.max(1, Math.round((p.to.getTime() - p.from.getTime()) / DAY));
  const activeSeries: AnalyticsReport["activeSeries"] = [];
  const costSeries: AnalyticsReport["costSeries"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dEnd = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - i + 1));
    const dStart = new Date(dEnd.getTime() - DAY);
    activeSeries.push({ date: iso(dStart).slice(0, 10), dau: active(dStart, dEnd) });
    costSeries.push({ date: iso(dStart).slice(0, 10), cost: Number(cost(dStart, dEnd).toFixed(4)) });
  }

  const actP = active(p.from, p.to);
  const actPrev = active(prev.from, prev.to);
  const sevCounts = new Map<string, number>();
  for (const s of within(safety, p.from, p.to)) sevCounts.set(s.severity, (sevCounts.get(s.severity) ?? 0) + 1);

  return {
    newOptedIn: metric(countKind("opted_in", p.from, p.to), countKind("opted_in", prev.from, prev.to)),
    dau: metric(active(new Date(end.getTime() - DAY), end), active(new Date(end.getTime() - 2 * DAY), new Date(end.getTime() - DAY))),
    wau: metric(active(new Date(end.getTime() - 7 * DAY), end), active(new Date(end.getTime() - 14 * DAY), new Date(end.getTime() - 7 * DAY))),
    mau: metric(active(new Date(end.getTime() - 30 * DAY), end), active(new Date(end.getTime() - 60 * DAY), new Date(end.getTime() - 30 * DAY))),
    messagesPerActiveUser: metric(msgsPerActive(p.from, p.to), msgsPerActive(prev.from, prev.to)),
    returningRate: metric(ret.rate, retPrev.rate),
    avgConversationMinutes: metric(convDur(p.from, p.to), convDur(prev.from, prev.to)),
    avgLatencyMs: metric(mean(latencies(p.from, p.to)), mean(latencies(prev.from, prev.to))),
    p95LatencyMs: percentile(latencies(p.from, p.to), 95),
    costPerConversation: metric(convCount(p.from, p.to) ? cost(p.from, p.to) / convCount(p.from, p.to) : null, convCount(prev.from, prev.to) ? cost(prev.from, prev.to) / convCount(prev.from, prev.to) : null),
    costPerActiveUser: metric(actP ? cost(p.from, p.to) / actP : null, actPrev ? cost(prev.from, prev.to) / actPrev : null),
    totalCost: metric(cost(p.from, p.to), cost(prev.from, prev.to)),
    checkinOptInRate: optedIn.length ? (optedIn.filter((u) => withCheckins.has(u.id)).length / optedIn.length) * 100 : null,
    checkinOptOutRate: metric(optOutRate(p.from, p.to), optOutRate(prev.from, prev.to)),
    safetyPer1000: metric(safetyRate(p.from, p.to), safetyRate(prev.from, prev.to)),
    toolUsage: toolNames.map((t) => ({ tool: t, count: toolCount(t, p.from, p.to), previous: toolCount(t, prev.from, prev.to) })).sort((a, b) => b.count - a.count),
    breathingEngagement: metric(toolUsers(["breathing_exercise"], p.from, p.to), toolUsers(["breathing_exercise"], prev.from, prev.to)),
    sleepEngagement: metric(toolUsers(["sleep_support"], p.from, p.to), toolUsers(["sleep_support"], prev.from, prev.to)),
    safetyBySeverity: ["low", "moderate", "high", "critical"].map((s) => ({ severity: s, count: sevCounts.get(s) ?? 0 })),
    cohorts,
    activeSeries,
    costSeries,
  };
}
