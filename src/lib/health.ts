/**
 * Live service checks for the dashboard. Nothing is reported healthy unless
 * it was actually checked; unconfigured services say so.
 */
import { db } from "./db";
import { env } from "./env";
import { AnthropicLlm } from "./llm/anthropic";
import { getSettings } from "./settings";
import { phoneNumberHealth, whatsappConfigured } from "./whatsapp/client";

export type HealthState = "operational" | "degraded" | "down" | "not_configured";

export interface ServiceHealth {
  key: "whatsapp" | "claude" | "database" | "jobs" | "checkins";
  label: string;
  state: HealthState;
  detail: string;
  latencyMs: number | null;
  checkedAt: string;
}

const cache = new Map<string, { at: number; value: ServiceHealth }>();

async function cached(key: string, ttlMs: number, fn: () => Promise<ServiceHealth>): Promise<ServiceHealth> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const now = () => new Date().toISOString();

export async function checkDatabase(): Promise<ServiceHealth> {
  try {
    const r = await db().ping();
    return { key: "database", label: "Database", state: r.ok ? "operational" : "down", detail: r.ok ? (db().kind === "supabase" ? "Supabase Postgres" : `Local ${db().kind} store (development)`) : (r.error ?? "Unreachable"), latencyMs: r.latencyMs, checkedAt: now() };
  } catch (e) {
    return { key: "database", label: "Database", state: "down", detail: String(e), latencyMs: null, checkedAt: now() };
  }
}

export async function checkClaude(): Promise<ServiceHealth> {
  return cached("claude", 60_000, async () => {
    if (!env.anthropicApiKey) return { key: "claude", label: "Claude API", state: "not_configured", detail: "Set ANTHROPIC_API_KEY", latencyMs: null, checkedAt: now() };
    const s = await getSettings();
    const r = await new AnthropicLlm().ping(s.ai.model);
    return { key: "claude", label: "Claude API", state: r.ok ? "operational" : "down", detail: r.ok ? `${s.ai.model} reachable` : (r.error ?? "Error"), latencyMs: r.latencyMs, checkedAt: now() };
  });
}

export async function checkWhatsapp(): Promise<ServiceHealth> {
  return cached("whatsapp", 60_000, async () => {
    if (!whatsappConfigured()) return { key: "whatsapp", label: "WhatsApp API", state: "not_configured", detail: "Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID", latencyMs: null, checkedAt: now() };
    if (!env.whatsappAppSecret || !env.whatsappVerifyToken) return { key: "whatsapp", label: "WhatsApp API", state: "degraded", detail: "Webhook secrets missing (WHATSAPP_APP_SECRET / WHATSAPP_VERIFY_TOKEN)", latencyMs: null, checkedAt: now() };
    const r = await phoneNumberHealth();
    return { key: "whatsapp", label: "WhatsApp API", state: r.ok ? "operational" : "down", detail: r.detail, latencyMs: r.latencyMs, checkedAt: now() };
  });
}

export async function checkJobs(): Promise<ServiceHealth> {
  const store = db();
  const hb = await store.get("settings", "worker_heartbeat");
  const at = hb ? String((hb.data as { at?: string }).at ?? "") : "";
  const age = at ? Date.now() - new Date(at).getTime() : Infinity;
  const backlog = await store.count("jobs", { where: { status: "queued" }, lt: { run_at: new Date(Date.now() - 120_000).toISOString() } });
  const dead = await store.count("jobs", { where: { status: "dead" }, gte: { updated_at: new Date(Date.now() - 86400_000).toISOString() } });
  let state: HealthState = "operational";
  if (!at) state = "down";
  else if (age > 10 * 60_000) state = "down";
  else if (age > 3 * 60_000 || backlog > 20 || dead > 0) state = "degraded";
  const detail = !at ? "No worker heartbeat yet – start the worker or cron" : `Last tick ${Math.round(age / 1000)}s ago · ${backlog} overdue · ${dead} failed (24h)`;
  return { key: "jobs", label: "Background jobs", state, detail, latencyMs: null, checkedAt: now() };
}

export async function checkCheckins(): Promise<ServiceHealth> {
  const store = db();
  const s = await getSettings();
  if (!s.checkins.enabled) return { key: "checkins", label: "Scheduled check-ins", state: "degraded", detail: "Disabled in settings", latencyMs: null, checkedAt: now() };
  const overdue = await store.count("checkin_schedules", { lt: { next_run_at: new Date(Date.now() - 10 * 60_000).toISOString() } });
  const approved = await store.count("message_templates", { where: { meta_status: "approved" } });
  const failed = await store.count("checkin_deliveries", { where: { status: "failed" }, gte: { created_at: new Date(Date.now() - 86400_000).toISOString() } });
  const state: HealthState = overdue > 0 ? "degraded" : failed > 0 ? "degraded" : "operational";
  return { key: "checkins", label: "Scheduled check-ins", state, detail: `${approved} approved template${approved === 1 ? "" : "s"} · ${overdue} overdue · ${failed} failed (24h)`, latencyMs: null, checkedAt: now() };
}

export async function systemHealth(): Promise<ServiceHealth[]> {
  return Promise.all([checkWhatsapp(), checkClaude(), checkDatabase(), checkJobs(), checkCheckins()]);
}
