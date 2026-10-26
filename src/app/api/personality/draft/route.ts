import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { TraitsSchema, discardDraft, getOrCreateDraft, updateDraft } from "@/lib/personality/service";

export const POST = handle(async () => {
  const admin = await requireApi("personality.edit");
  return json({ draft: await getOrCreateDraft(admin.email) });
});

export const PATCH = handle(async (req: Request) => {
  const admin = await requireApi("personality.edit");
  const b = await parseBody(req, z.object({ id: z.string().uuid(), instructions: z.string().optional(), traits: TraitsSchema.optional(), notes: z.string().max(300).nullable().optional() }));
  const draft = await updateDraft(b.id, b);
  await audit(admin, "personality.draft_update", { type: "prompt_version", id: b.id });
  return json({ draft });
});

export const DELETE = handle(async (req: Request) => {
  const admin = await requireApi("personality.edit");
  const { id } = await parseBody(req, z.object({ id: z.string().uuid() }));
  await discardDraft(id);
  await audit(admin, "personality.draft_discard", { type: "prompt_version", id });
  return json({ ok: true });
});
