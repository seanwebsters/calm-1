import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { extractCandidates, filterCandidates } from "@/lib/memory/service";
import { llm } from "@/lib/llm";
import { NotConfiguredError } from "@/lib/errors";
import { isValidTimezone } from "@/lib/checkins/time";

/** Dry-run memory extraction on sample text. Nothing is stored. */
export const POST = handle(async (req: Request) => {
  await requireApi("simulator.use");
  const b = await parseBody(req, z.object({ text: z.string().trim().min(1).max(2000), timezone: z.string().default("Europe/London") }));
  if (!llm().configured()) throw new NotConfiguredError("Claude", ["ANTHROPIC_API_KEY"]);
  const tz = isValidTimezone(b.timezone) ? b.timezone : "Europe/London";
  const t0 = Date.now();
  const cands = await extractCandidates(b.text, { timezone: tz, existing: [], channel: "admin" });
  const r = filterCandidates(cands, new Set());
  return json({ accepted: r.accepted, rejected: r.rejected, latencyMs: Date.now() - t0 });
});
