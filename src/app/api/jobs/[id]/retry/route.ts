import { handle, json } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { retryJob } from "@/lib/jobs/queue";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const admin = await requireApi("settings.manage");
  const { id } = await ctx.params;
  await retryJob(id);
  await audit(admin, "job.retry", { type: "job", id });
  return json({ ok: true });
});
