import { after } from "next/server";
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { requireSimUser } from "@/lib/admin/simulator";
import { handleInbound } from "@/lib/engine/turn";
import { deleteUserData } from "@/lib/users/service";
import { kickWorker } from "@/lib/jobs/inprocess";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const maxDuration = 120;

export const POST = handle(async (req: Request) => {
  await requireApi("simulator.use");
  const b = await parseBody(req, z.object({ userId: z.string().uuid(), text: z.string().trim().min(1).max(4000), promptVersion: z.number().int().positive().optional() }));
  const user = await requireSimUser(b.userId);
  let promptOverride;
  if (b.promptVersion) {
    const v = await db().findOne("prompt_versions", { where: { version: b.promptVersion } });
    if (!v) throw new AppError("Prompt version not found", 404);
    promptOverride = { instructions: v.instructions, traits: v.traits, version: v.version };
  }
  const result = await handleInbound({ user, channel: "simulator", text: b.text, kind: "text", promptOverride });
  if (result.deleted) await deleteUserData(user.id, "simulator", null);
  after(() => kickWorker());
  return json({ result });
});
