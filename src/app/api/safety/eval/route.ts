import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { runSafetyEval } from "@/lib/safety/eval";
import { llm } from "@/lib/llm";

export const maxDuration = 300;

export const POST = handle(async (req: Request) => {
  const admin = await requireApi("safety.review");
  const { useModel } = await parseBody(req, z.object({ useModel: z.boolean().default(false) }));
  const r = await runSafetyEval({ createdBy: admin.email, useModel: useModel && llm().configured() });
  await audit(admin, "safety.eval_run", { type: "evaluation", id: null }, { meta: { ...r.summary, useModel } });
  return json(r);
});
