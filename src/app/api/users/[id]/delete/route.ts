import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { deleteUserData } from "@/lib/users/service";
import { AppError } from "@/lib/errors";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("users.delete");
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, z.object({ reason: z.string().trim().min(5).max(300) }));
  const user = await db().get("users", id);
  if (!user) throw new AppError("User not found", 404);
  await deleteUserData(id, "admin", admin.email);
  await audit(admin, "user.delete", { type: "user", id: user.anon_id }, { reason });
  return json({ ok: true });
});
