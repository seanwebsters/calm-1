import { handle } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { exportUserData } from "@/lib/users/service";
import { AppError } from "@/lib/errors";

/** Subject access request: full decrypted export. Audited. */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("users.delete");
  const { id } = await ctx.params;
  const reason = new URL(req.url).searchParams.get("reason") ?? "";
  if (reason.trim().length < 5) throw new AppError("A reason is required (e.g. the support ticket reference).");
  const data = await exportUserData(id);
  if (!data) throw new AppError("User not found", 404);
  await audit(admin, "user.export", { type: "user", id: data.account.id }, { reason });
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="calm-1-export-${data.account.id}.json"`, "Cache-Control": "no-store" },
  });
});
