import { handle, json } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { simulatorState } from "@/lib/admin/simulator";
import { db } from "@/lib/db";

export const GET = handle(async (req: Request) => {
  await requireApi("simulator.use");
  const userId = new URL(req.url).searchParams.get("userId") ?? "";
  if (!(await db().get("users", userId))) return json({ deleted: true });
  return json(await simulatorState(userId));
});
