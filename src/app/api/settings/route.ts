import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { can } from "@/lib/auth/roles";
import { ForbiddenError } from "@/lib/errors";
import { SettingsSchema, getSettings, updateSettings } from "@/lib/settings";

const Patch = z.object({
  ai: SettingsSchema.shape.ai.partial().optional(),
  privacy: SettingsSchema.shape.privacy.partial().optional(),
  checkins: SettingsSchema.shape.checkins.partial().optional(),
  voice: SettingsSchema.shape.voice.partial().optional(),
});

export const GET = handle(async () => {
  await requireApi("dashboard.view");
  return json({ settings: await getSettings() });
});

export const PATCH = handle(async (req: Request) => {
  const admin = await requireApi("dashboard.view");
  const patch = await parseBody(req, Patch);
  // Operators may tune check-in scheduling; everything else needs settings.manage.
  const onlyCheckins = Object.keys(patch).every((k) => k === "checkins");
  if (!(can(admin.role, "settings.manage") || (onlyCheckins && can(admin.role, "checkins.manage")))) throw new ForbiddenError();
  const settings = await updateSettings(patch, admin.email);
  await audit(admin, "settings.update", { type: "settings", id: "global" }, { meta: patch as Record<string, unknown> });
  return json({ settings });
});
