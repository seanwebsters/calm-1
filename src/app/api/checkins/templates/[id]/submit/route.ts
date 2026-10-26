import { handle, json } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { submitToMeta } from "@/lib/checkins/templates";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("checkins.manage");
  const { id } = await ctx.params;
  const t = await submitToMeta(id);
  await audit(admin, "template.submit", { type: "template", id });
  return json({ template: t });
});
