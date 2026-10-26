import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { ContentInput, deleteContent, updateContent } from "@/lib/content/service";
import { AppError } from "@/lib/errors";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("content.manage");
  const { id } = await ctx.params;
  const patch = await parseBody(req, ContentInput.partial());
  const item = await updateContent(id, patch);
  if (!item) throw new AppError("Not found", 404);
  await audit(admin, "content.update", { type: "content", id }, { meta: { fields: Object.keys(patch) } });
  return json({ item });
});

export const DELETE = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("content.manage");
  const { id } = await ctx.params;
  await deleteContent(id);
  await audit(admin, "content.delete", { type: "content", id });
  return json({ ok: true });
});
