import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { ContentInput, createContent, listContent } from "@/lib/content/service";

export const GET = handle(async () => {
  await requireApi("dashboard.view");
  return json({ items: await listContent() });
});

export const POST = handle(async (req: Request) => {
  const admin = await requireApi("content.manage");
  const item = await createContent(await parseBody(req, ContentInput));
  await audit(admin, "content.create", { type: "content", id: item.id }, { meta: { title: item.title, verified: item.verified } });
  return json({ item });
});
