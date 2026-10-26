/**
 * Development convenience: run the scheduler inside the web process so the
 * local simulator gets memory extraction, summaries and check-ins without a
 * separate worker. Production uses scripts/worker.ts or the cron endpoint.
 */
import { log, errorMessage } from "../log";

const g = globalThis as unknown as { __calm1Worker?: NodeJS.Timeout };

export function startInProcessWorker(intervalMs = 5000) {
  if (g.__calm1Worker) return;
  const id = `web-${process.pid}`;
  let running = false;
  g.__calm1Worker = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const { tick } = await import("./handlers");
      await tick(id, 4000);
    } catch (e) {
      log.error("in-process worker tick failed", { error: errorMessage(e) });
    } finally {
      running = false;
    }
  }, intervalMs);
  log.info("in-process worker started", { id });
}

/** Process queued work right away (e.g. after a simulator message) instead of waiting for the next tick. */
export async function kickWorker() {
  try {
    const { processJobs } = await import("./queue");
    await import("./handlers");
    await processJobs(`kick-${process.pid}`, 10);
  } catch (e) {
    log.warn("worker kick failed", { error: errorMessage(e) });
  }
}
