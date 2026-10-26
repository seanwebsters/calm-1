import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { deleteMemory, listMemories } from "@/lib/memory/service";

/** View a user's memories (support/data requests only). Audited with reason. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("memories.view_user");
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(10).max(300) }));
  const user = await db().get("users", id);
  if (!user) throw new AppError("User not found", 404);
  await audit(admin, "memories.view", { type: "user", id: user.anon_id }, { reason });
  return json({ memories: await listMemories(id) });
});

export const DELETE = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("memories.view_user");
  const { id } = await ctx.params;
  const { memoryId, reason } = await parseBody(req, z.object({ memoryId: z.string().uuid(), reason: z.string().trim().min(5).max(300) }));
  const user = await db().get("users", id);
  if (!user) throw new AppError("User not found", 404);
  if (!(await deleteMemory(id, memoryId, "admin"))) throw new AppError("Memory not found", 404);
  await audit(admin, "memories.delete", { type: "user", id: user.anon_id }, { reason });
  return json({ ok: true });
});
