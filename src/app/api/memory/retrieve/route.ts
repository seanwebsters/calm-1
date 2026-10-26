import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { renderMemories, selectMemories } from "@/lib/memory/service";
import { localDateString, isValidTimezone } from "@/lib/checkins/time";

/** Deterministic retrieval test: which memories would be used for a message? */
export const POST = handle(async (req: Request) => {
  await requireApi("simulator.use");
  const b = await parseBody(
    req,
    z.object({
      message: z.string().trim().min(1).max(1000),
      timezone: z.string().default("Europe/London"),
      limit: z.number().int().min(1).max(20).default(6),
      memories: z.array(z.object({ kind: z.enum(["name", "preference", "goal", "style", "technique", "event", "context"]), text: z.string().min(1).max(300), event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null) })).max(60),
    }),
  );
  const tz = isValidTimezone(b.timezone) ? b.timezone : "Europe/London";
  const all = b.memories.map((m, i) => ({ id: String(i), kind: m.kind, text: m.text, event_date: m.event_date, created_at: new Date().toISOString(), confidence: 1 }));
  const picked = selectMemories(all, b.message, localDateString(new Date(), tz), b.limit);
  return json({ picked, rendered: renderMemories(picked), today: localDateString(new Date(), tz) });
});
