import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { nowIso } from "@/lib/ids";
import { AppError } from "@/lib/errors";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("safety.review");
  const { id } = await ctx.params;
  const { review_status } = await parseBody(req, z.object({ review_status: z.enum(["unreviewed", "confirmed", "false_positive"]) }));
  const ev = await db().update("safety_events", id, { review_status, reviewed_by: admin.email, reviewed_at: nowIso() });
  if (!ev) throw new AppError("Event not found", 404);
  await audit(admin, "safety.review", { type: "safety_event", id }, { meta: { review_status } });
  return json({ event: ev });
});
