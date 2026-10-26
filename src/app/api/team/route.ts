import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { inviteAdmin, requireApi } from "@/lib/auth/session";

export const POST = handle(async (req: Request) => {
  const admin = await requireApi("team.manage");
  const b = await parseBody(req, z.object({ email: z.string().email(), name: z.string().trim().min(1).max(80), role: z.enum(["owner", "admin", "operator", "safety_reviewer", "analyst"]) }));
  return json({ admin: await inviteAdmin(admin, b) });
});
