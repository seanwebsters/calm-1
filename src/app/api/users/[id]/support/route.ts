import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getSettings } from "@/lib/settings";
import { recordConsent, setPreferences } from "@/lib/users/service";
import { setPaused, unsubscribe } from "@/lib/checkins/service";

/**
 * Consent-related support actions taken at a user's request (e.g. they
 * contacted support). Only actions that *reduce* processing are offered here;
 * opting someone *in* must come from the user themselves.
 */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("users.manage");
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ action: z.enum(["pause_checkins", "stop_checkins", "memory_off", "opt_out"]), reason: z.string().trim().min(5).max(300) }));
  const user = await db().get("users", id);
  if (!user) throw new AppError("User not found", 404);
  const v = (await getSettings()).privacy.noticeVersion;
  switch (b.action) {
    case "pause_checkins":
      await setPaused(id, true);
      break;
    case "stop_checkins":
      await unsubscribe(user, "admin");
      break;
    case "memory_off":
      await setPreferences(id, { memory_enabled: false });
      await recordConsent(id, "memory", false, v, "admin");
      break;
    case "opt_out":
      await unsubscribe(user, "admin");
      await db().update("users", id, { status: "opted_out" });
      await recordConsent(id, "privacy_notice", false, v, "admin");
      break;
  }
  await audit(admin, `user.${b.action}`, { type: "user", id: user.anon_id }, { reason: b.reason });
  return json({ ok: true });
});
