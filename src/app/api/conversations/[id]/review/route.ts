import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { nowIso, uuid } from "@/lib/ids";
import { SAFETY_POLICY_VERSION } from "@/lib/safety/rules";
import { AppError } from "@/lib/errors";

const TAGS = ["natural", "specific", "too_long", "too_many_questions", "generic", "missed_context", "good_memory_use", "pushy_exercise", "safety_handled_well", "safety_concern", "factual_error"] as const;

/** Quality review of a conversation (tags only – never copies message text). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("simulator.use");
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ rating: z.enum(["good", "needs_work", "bad"]), tags: z.array(z.enum(TAGS)).max(8).default([]) }));
  const conv = await db().get("conversations", id);
  if (!conv) throw new AppError("Conversation not found", 404);
  await db().insert("ai_evaluations", {
    id: uuid(),
    kind: "quality",
    policy_version: SAFETY_POLICY_VERSION,
    prompt_version: conv.prompt_version,
    mode: "rules",
    total: 1,
    passed: b.rating === "good" ? 1 : 0,
    results: { conversation_id: id, channel: conv.channel, rating: b.rating, tags: b.tags },
    created_by: admin.email,
    created_at: nowIso(),
  });
  await audit(admin, "conversation.review", { type: "conversation", id }, { meta: { rating: b.rating } });
  return json({ ok: true });
});
