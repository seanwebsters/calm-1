import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";
import { db } from "@/lib/db";
import { nowIso, uuid } from "@/lib/ids";

const TemplateInput = z.object({
  name: z.string().regex(/^[a-z0-9_]{3,60}$/, "Lowercase letters, numbers and underscores only"),
  kind: z.enum(["morning", "evening", "bedtime", "reengagement"]),
  language: z.string().min(2).max(10).default("en_GB"),
  category: z.enum(["utility", "marketing"]).default("utility"),
  body: z.string().trim().min(10).max(1024),
});

export const POST = handle(async (req: Request) => {
  const admin = await requireApi("checkins.manage");
  const b = await parseBody(req, TemplateInput);
  const row = await db().insert("message_templates", { id: uuid(), ...b, meta_status: "draft", meta_template_id: null, updated_at: nowIso() });
  await audit(admin, "template.create", { type: "template", id: row.id });
  return json({ template: row });
});
