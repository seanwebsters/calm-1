import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { requireSimUser } from "@/lib/admin/simulator";
import { createSimulatorUser, deleteUserData } from "@/lib/users/service";
import { audit } from "@/lib/auth/audit";

/** Erase a test identity and start a fresh one with the same label. */
export const POST = handle(async (req: Request) => {
  const admin = await requireApi("simulator.use");
  const { userId } = await parseBody(req, z.object({ userId: z.string().uuid() }));
  const old = await requireSimUser(userId);
  await deleteUserData(old.id, "simulator", admin.email);
  const u = await createSimulatorUser({ label: old.test_label ?? "Tester", countryCode: old.country_code, timezone: old.timezone });
  await audit(admin, "simulator.reset", { type: "user", id: old.anon_id });
  return json({ user: { id: u.id, anonId: u.anon_id, label: u.test_label } });
});
