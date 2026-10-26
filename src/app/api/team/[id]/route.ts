import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export const PATCH = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("team.manage");
  const { id } = await ctx.params;
  const b = await parseBody(req, z.object({ role: z.enum(["owner", "admin", "operator", "safety_reviewer", "analyst"]).optional(), active: z.boolean().optional() }));
  if (id === admin.adminId && (b.active === false || (b.role && b.role !== "owner"))) throw new AppError("You can't remove your own owner access.");
  const row = await db().update("admin_users", id, b);
  if (!row) throw new AppError("Not found", 404);
  await audit(admin, "team.update", { type: "admin_user", id }, { meta: b });
  return json({ admin: row });
});
