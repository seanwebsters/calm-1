import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { createSimulatorUser } from "@/lib/users/service";
import { listSimUsers } from "@/lib/admin/simulator";
import { isValidTimezone } from "@/lib/checkins/time";

export const GET = handle(async () => {
  await requireApi("simulator.use");
  return json({ users: await listSimUsers() });
});

export const POST = handle(async (req: Request) => {
  await requireApi("simulator.use");
  const b = await parseBody(req, z.object({ label: z.string().trim().min(1).max(40), countryCode: z.enum(["44", "1", "353", "61", "other"]).default("44"), timezone: z.string().default("Europe/London") }));
  if (!isValidTimezone(b.timezone)) return json({ error: "Unknown timezone" }, { status: 400 });
  const u = await createSimulatorUser({ label: b.label, countryCode: b.countryCode === "other" ? null : b.countryCode, timezone: b.timezone });
  return json({ user: { id: u.id, anonId: u.anon_id, label: u.test_label } });
});
