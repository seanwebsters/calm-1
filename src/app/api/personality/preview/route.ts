import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { requireApi } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { llm, recordCost, textOf, type MessageParam } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { composeSystemPrompt } from "@/lib/personality/prompt";
import { TraitsSchema } from "@/lib/personality/service";
import { NotConfiguredError, AppError } from "@/lib/errors";
import { describeLocalNow } from "@/lib/checkins/time";

/**
 * Stateless preview: run the same conversation against several prompt
 * versions (or unsaved draft settings) side by side. Nothing is persisted
 * and tools are disabled so previews have no side effects.
 */
export const POST = handle(async (req: Request) => {
  const admin = await requireApi("personality.edit");
  const b = await parseBody(
    req,
    z.object({
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) })).max(12).default([]),
      message: z.string().trim().min(1).max(2000),
      variants: z.array(z.union([z.object({ version: z.number().int() }), z.object({ instructions: z.string().min(20).max(8000), traits: TraitsSchema, label: z.string().max(40) })])).min(1).max(3),
    }),
  );
  if (!llm().configured()) throw new NotConfiguredError("Claude", ["ANTHROPIC_API_KEY"]);
  const settings = await getSettings();
  const messages: MessageParam[] = [...b.history.map((h) => ({ role: h.role, content: h.text })), { role: "user" as const, content: b.message }];
  const results = await Promise.all(
    b.variants.map(async (v) => {
      let instructions: string;
      let traits;
      let label: string;
      if ("version" in v) {
        const row = await db().findOne("prompt_versions", { where: { version: v.version } });
        if (!row) throw new AppError(`Version ${v.version} not found`, 404);
        instructions = row.instructions;
        traits = row.traits;
        label = `v${row.version} (${row.status})`;
      } else {
        instructions = v.instructions;
        traits = v.traits;
        label = v.label;
      }
      const res = await llm().create({
        model: settings.ai.model,
        system: composeSystemPrompt(instructions, traits),
        context: `Now for the user: ${describeLocalNow("Europe/London")}.\nChannel: preview (treat like WhatsApp). Memory is OFF. Tools are unavailable in previews – if you'd normally use one, just respond naturally.`,
        messages,
        maxTokens: settings.ai.maxOutputTokens,
        effort: settings.ai.effort,
        timeoutMs: settings.ai.timeoutMs,
      });
      const cost = await recordCost(res, { purpose: "preview", channel: "admin" });
      return { label, text: textOf(res.content), latencyMs: res.latencyMs, tokens: res.usage, cost, by: admin.email };
    }),
  );
  return json({ results });
});
