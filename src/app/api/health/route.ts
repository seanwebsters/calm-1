import { handle, json } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { systemHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireApi("dashboard.view");
  return json({ services: await systemHealth() });
});
