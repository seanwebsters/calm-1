import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { can } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { transcript } from "@/lib/admin/conversations";
import { getSettings } from "@/lib/settings";

/**
 * Open a transcript. Production conversations need `transcripts.view`, a
 * written reason, and transcript access enabled in Settings → Privacy.
 * Every access is written to the audit log.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("dashboard.view");
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().max(300).default("") }));
  const conv = await db().get("conversations", id);
  if (!conv) throw new AppError("Conversation not found", 404);
  if (conv.channel === "whatsapp") {
    if (!can(admin.role, "transcripts.view")) throw new ForbiddenError("Your role can't open production transcripts.");
    if (!(await getSettings()).privacy.allowTranscriptAccess) throw new ForbiddenError("Transcript access is switched off in Settings → Privacy.");
    if (reason.length < 10) throw new AppError("Give a reason (at least 10 characters). It's recorded in the audit log.");
  } else if (!can(admin.role, "simulator.use") && !can(admin.role, "transcripts.view")) {
    throw new ForbiddenError();
  }
  const user = await db().get("users", conv.user_id);
  await audit(admin, "transcript.view", { type: "conversation", id }, { reason: reason || null, meta: { channel: conv.channel, anon_id: user?.anon_id } });
  return json({ messages: await transcript(id) });
});
