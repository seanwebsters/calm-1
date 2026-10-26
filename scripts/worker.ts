/**
 * Dedicated background worker for long-running hosts (Railway, Fly, Render,
 * a container…). Runs the scheduler tick in a loop. Safe to run several
 * copies: job claiming is atomic in Postgres.
 *
 *   npm run worker
 */
import { tick } from "../src/lib/jobs/handlers";
import { log, errorMessage } from "../src/lib/log";
import { db } from "../src/lib/db";

const id = `worker-${process.env.HOSTNAME ?? "local"}-${process.pid}`;
let stopping = false;

process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  if (db().kind !== "supabase") log.warn("worker is using a non-Supabase store; run it in the same process as the app instead (IN_PROCESS_WORKER=1)");
  log.info("worker started", { id });
  while (!stopping) {
    try {
      const r = await tick(id, 20000);
      if (r.processed === 0) await new Promise((res) => setTimeout(res, 2000));
    } catch (e) {
      log.error("worker tick failed", { error: errorMessage(e) });
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
  log.info("worker stopped", { id });
}

void main();
