import { handle, json } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { syncFromMeta } from "@/lib/checkins/templates";

export const POST = handle(async () => {
  await requireApi("checkins.manage");
  return json(await syncFromMeta());
});
