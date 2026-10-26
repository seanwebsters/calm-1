import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { requireSimUser } from "@/lib/admin/simulator";
import { triggerCheckinNow } from "@/lib/checkins/service";

export const POST = handle(async (req: Request) => {
  await requireApi("simulator.use");
  const b = await parseBody(req, z.object({ userId: z.string().uuid(), kind: z.enum(["morning", "evening", "bedtime"]) }));
  await requireSimUser(b.userId);
  return json(await triggerCheckinNow(b.userId, b.kind));
});
