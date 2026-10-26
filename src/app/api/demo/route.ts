import { handle, json } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { clearDemo, seedDemo } from "@/lib/demo/seed";

export const maxDuration = 300;

export const POST = handle(async () => {
  const admin = await requireApi("settings.manage");
  const r = await seedDemo();
  await audit(admin, "demo.seed", { type: "demo", id: null }, { meta: r });
  return json(r);
});

export const DELETE = handle(async () => {
  const admin = await requireApi("settings.manage");
  const n = await clearDemo();
  await audit(admin, "demo.clear", { type: "demo", id: null }, { meta: { users: n } });
  return json({ removed: n });
});
