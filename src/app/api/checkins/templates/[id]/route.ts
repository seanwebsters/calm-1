import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { TemplatePatch, updateTemplate } from "@/lib/checkins/templates";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("checkins.manage");
  const { id } = await ctx.params;
  const t = await updateTemplate(id, await parseBody(req, TemplatePatch));
  await audit(admin, "template.update", { type: "template", id });
  return json({ template: t });
});
