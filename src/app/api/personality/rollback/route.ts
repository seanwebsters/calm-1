import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { rollbackTo } from "@/lib/personality/service";

export const POST = handle(async (req: Request) => {
  const admin = await requireApi("personality.publish");
  const { version } = await parseBody(req, z.object({ version: z.number().int().positive() }));
  const v = await rollbackTo(version, admin.email);
  await audit(admin, "personality.rollback", { type: "prompt_version", id: v.id }, { meta: { to: version, new_version: v.version } });
  return json({ version: v });
});
