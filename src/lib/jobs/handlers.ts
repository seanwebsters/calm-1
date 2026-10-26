/**
 * Job handlers. Importing this module registers them; both the web process
 * (in-process worker / cron tick) and scripts/worker.ts import it.
 */
import { db } from "../db";
import { open } from "../crypto";
import { getSettings } from "../settings";
import { log } from "../log";
import { extractAndStore } from "../memory/service";
import { summariseConversation } from "../engine/summary";
import { messagesAfter } from "../engine/conversations";
import { runDueCheckins } from "../checkins/service";
import { processWhatsappMessage } from "../whatsapp/adapter";
import { PermanentJobError, enqueue, processJobs, recoverStuckJobs, registerJob } from "./queue";

registerJob("memory.extract", async (p) => {
  const userId = String(p.userId);
  const msg = await db().get("messages", String(p.messageId));
  if (!msg) return; // user deleted or retention purge – nothing to do
  const recent = (await messagesAfter(String(p.conversationId), Math.max(0, msg.seq - 6), 6))
    .filter((m) => m.seq < msg.seq)
    .map((m) => `${m.direction === "inbound" ? "User" : "Calm-1"}: ${m.text}`);
  await extractAndStore(userId, msg.id, open(msg.content_enc), recent);
});

registerJob("conversation.summarise", async (p) => {
  await summariseConversation(String(p.conversationId));
});

registerJob("whatsapp.inbound", async (p) => {
  await processWhatsappMessage(p as never);
});

registerJob("retention.sweep", async () => {
  const s = await getSettings();
  const store = db();
  const cutoff = (days: number) => new Date(Date.now() - days * 86400_000).toISOString();
  let n = 0;
  for (const m of await store.find("messages", { lt: { created_at: cutoff(s.privacy.messageRetentionDays) }, columns: ["id"] })) {
    await store.remove("messages", m.id);
    n++;
  }
  for (const w of await store.find("webhook_events", { lt: { created_at: cutoff(s.privacy.webhookRetentionDays) }, columns: ["id"] })) await store.remove("webhook_events", w.id);
  for (const j of await store.find("jobs", { in: { status: ["done", "dead"] }, lt: { updated_at: cutoff(s.privacy.jobRetentionDays) }, columns: ["id"] })) await store.remove("jobs", j.id);
  const now = new Date().toISOString();
  for (const m of await store.find("memories", { where: { status: "active" }, lt: { expires_at: now }, notNull: ["expires_at"] })) {
    await store.update("memories", m.id, { status: "deleted", content_enc: "" });
  }
  log.info("retention sweep", { messagesDeleted: n });
});

registerJob("noop", async () => {});

let lastSweep = 0;

/**
 * One scheduler heartbeat: recover stuck jobs, send due check-ins, schedule
 * the daily retention sweep, and drain the queue for up to `budgetMs`.
 */
export async function tick(workerId: string, budgetMs = 20000) {
  const started = Date.now();
  await recoverStuckJobs();
  const checkins = await runDueCheckins();
  if (Date.now() - lastSweep > 24 * 3600_000) {
    lastSweep = Date.now();
    const pending = await db().count("jobs", { where: { type: "retention.sweep", status: "queued" } });
    if (!pending) await enqueue("retention.sweep", {});
  }
  let processed = 0;
  let failed = 0;
  while (Date.now() - started < budgetMs) {
    const r = await processJobs(workerId, 10);
    processed += r.processed;
    failed += r.failed;
    if (r.processed === 0) break;
  }
  const stats = { checkins, processed, failed, ms: Date.now() - started };
  await recordHeartbeat(workerId, stats);
  return stats;
}

async function recordHeartbeat(workerId: string, stats: Record<string, unknown>) {
  const store = db();
  const data = { at: new Date().toISOString(), workerId, stats };
  if (await store.get("settings", "worker_heartbeat")) await store.update("settings", "worker_heartbeat", { data, updated_at: data.at });
  else await store.insert("settings", { id: "worker_heartbeat", data, updated_at: data.at, updated_by: null });
}

export { PermanentJobError };
