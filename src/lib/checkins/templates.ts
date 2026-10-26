import { z } from "zod";
import { db } from "../db";
import { nowIso } from "../ids";
import { AppError } from "../errors";
import { listTemplates, submitTemplate } from "../whatsapp/client";

export const TemplatePatch = z.object({
  body: z.string().trim().min(10).max(1024).optional(),
  category: z.enum(["utility", "marketing"]).optional(),
  language: z.string().min(2).max(10).optional(),
});

export async function updateTemplate(id: string, patch: z.infer<typeof TemplatePatch>) {
  const t = await db().get("message_templates", id);
  if (!t) throw new AppError("Template not found", 404);
  // Any content change needs Meta approval again before it can be sent.
  return db().update("message_templates", id, { ...patch, meta_status: "draft", meta_template_id: null, updated_at: nowIso() });
}

export async function submitToMeta(id: string) {
  const t = await db().get("message_templates", id);
  if (!t) throw new AppError("Template not found", 404);
  const r = await submitTemplate({ name: t.name, language: t.language, category: t.category, body: t.body });
  return db().update("message_templates", id, { meta_status: r.status?.toLowerCase() === "approved" ? "approved" : "pending", meta_template_id: r.id, category: (r.category?.toLowerCase() as "utility" | "marketing") ?? t.category, updated_at: nowIso() });
}

/** Pull approval status and the category Meta actually assigned. */
export async function syncFromMeta(): Promise<{ updated: number; unknown: number }> {
  const remote = await listTemplates();
  const local = await db().find("message_templates", {});
  let updated = 0;
  for (const t of local) {
    const r = remote.find((x) => x.name === t.name && x.language === t.language);
    const status = r ? (r.status.toLowerCase() as "approved" | "pending" | "rejected" | "paused") : "unknown";
    const mapped = ["approved", "pending", "rejected", "paused"].includes(status) ? status : "unknown";
    if (mapped !== t.meta_status || (r && r.id !== t.meta_template_id)) {
      await db().update("message_templates", t.id, { meta_status: mapped as never, meta_template_id: r?.id ?? t.meta_template_id, ...(r ? { category: r.category.toLowerCase() === "marketing" ? "marketing" : "utility" } : {}), updated_at: nowIso() });
      updated++;
    }
  }
  return { updated, unknown: local.length - remote.filter((r) => local.some((l) => l.name === r.name)).length };
}
