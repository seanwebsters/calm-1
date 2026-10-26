/**
 * Durable job queue backed by the `jobs` table. Works with any number of
 * workers (claiming is atomic in Postgres) and keeps per-user ordering via
 * lock keys. Failed jobs retry with exponential backoff, then go "dead"
 * and show up under Settings → System → Failed jobs.
 */
import { db } from "../db";
import type { JobRow } from "../db/types";
import { nowIso, uuid } from "../ids";
import { errorMessage, log } from "../log";

export type JobHandler = (payload: Record<string, unknown>, job: JobRow) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJob(type: string, handler: JobHandler) {
  handlers.set(type, handler);
}

export async function enqueue(type: string, payload: Record<string, unknown>, opts: { lockKey?: string | null; runAt?: Date; maxAttempts?: number } = {}): Promise<JobRow> {
  return db().insert("jobs", {
    id: uuid(),
    type,
    payload,
    status: "queued",
    run_at: (opts.runAt ?? new Date()).toISOString(),
    attempts: 0,
    max_attempts: opts.maxAttempts ?? 5,
    lock_key: opts.lockKey ?? null,
    locked_by: null,
    locked_at: null,
    last_error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
}

export function retryDelayMs(attempt: number): number {
  return Math.min(15 * 60_000, 2000 * 2 ** (attempt - 1));
}

export class PermanentJobError extends Error {}

export async function processJobs(workerId: string, limit = 10): Promise<{ processed: number; failed: number }> {
  const store = db();
  const jobs = await store.claimJobs(workerId, limit, nowIso());
  let failed = 0;
  // Different lock keys can run concurrently; claimJobs guarantees one per key.
  await Promise.all(
    jobs.map(async (job) => {
      const handler = handlers.get(job.type);
      try {
        if (!handler) throw new PermanentJobError(`No handler for job type ${job.type}`);
        await handler(job.payload, job);
        await store.update("jobs", job.id, { status: "done", updated_at: nowIso(), last_error: null });
      } catch (e) {
        failed++;
        const permanent = e instanceof PermanentJobError;
        const dead = permanent || job.attempts >= job.max_attempts;
        log.warn("job failed", { jobId: job.id, type: job.type, attempt: job.attempts, dead, error: errorMessage(e) });
        await store.update("jobs", job.id, {
          status: dead ? "dead" : "queued",
          run_at: dead ? job.run_at : new Date(Date.now() + retryDelayMs(job.attempts)).toISOString(),
          last_error: errorMessage(e).slice(0, 500),
          locked_by: null,
          updated_at: nowIso(),
        });
      }
    }),
  );
  return { processed: jobs.length, failed };
}

/** Release jobs left "running" by a crashed worker. */
export async function recoverStuckJobs(olderThanMs = 5 * 60_000) {
  const store = db();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const stuck = await store.find("jobs", { where: { status: "running" }, lt: { locked_at: cutoff } });
  for (const j of stuck) await store.update("jobs", j.id, { status: j.attempts >= j.max_attempts ? "dead" : "queued", locked_by: null, last_error: "Recovered after worker timeout", updated_at: nowIso() });
  return stuck.length;
}

export async function retryJob(id: string) {
  await db().update("jobs", id, { status: "queued", run_at: nowIso(), attempts: 0, last_error: null, updated_at: nowIso() });
}
