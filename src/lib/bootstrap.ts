import { ensureExampleContent } from "./content/service";
import { ensureTemplates } from "./checkins/service";
import { getPublished } from "./personality/service";
import { env } from "./env";
import { startInProcessWorker } from "./jobs/inprocess";

let done = false;

/** First-run setup: default prompt version, example content rows, check-in templates. */
export async function ensureBootstrapped() {
  if (done) return;
  await getPublished();
  await ensureExampleContent();
  await ensureTemplates();
  if (env.inProcessWorker) startInProcessWorker();
  done = true;
}
