import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { publish } from "@/lib/personality/service";

export const POST = handle(async (req: Request) => {
  const admin = await requireApi("personality.publish");
  const { id } = await parseBody(req, z.object({ id: z.string().uuid() }));
  const v = await publish(id);
  await audit(admin, "personality.publish", { type: "prompt_version", id }, { meta: { version: v.version } });
  return json({ version: v });
});
