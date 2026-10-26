/**
 * Layered safety:
 *  1. Input assessment – deterministic rules, then (optionally) a model
 *     review for flagged or ambiguous messages.
 *  2. Context-aware response – guidance injected into the system context.
 *  3. Tool permissions – risky turns get a restricted tool set.
 *  4. Output assessment – every reply is checked; high-risk replies must
 *     carry crisis resources and must not contain method/dose/diagnosis text.
 *  5. Logging – category, severity and rule id only. Never message text.
 */
import { z } from "zod";
import { db } from "../db";
import type { Channel, SafetyEventRow, Severity } from "../db/types";
import { nowIso, uuid } from "../ids";
import { llm, recordCost, textOf } from "../llm";
import { errorMessage, log } from "../log";
import { getSettings } from "../settings";
import { crisisLine, fallbackResponse, resourcesFor, type Resources } from "./resources";
import { SAFETY_POLICY_VERSION, SOFT_SIGNALS, matchRules, maxSeverity, severityRank, type RuleMatch, type SafetyCategory } from "./rules";

export interface InputAssessment {
  severity: Severity;
  category: SafetyCategory | null;
  matches: RuleMatch[];
  modelReviewed: boolean;
  modelSeverity: Severity | null;
  /** Instruction for the response model, empty when nothing is flagged. */
  guidance: string;
  /** Tool names allowed this turn ("all" = no restriction). */
  allowedTools: "all" | string[];
  requireResources: boolean;
  resources: Resources;
}

const ModelReview = z.object({
  risk_level: z.enum(["none", "low", "moderate", "high", "critical"]),
  category: z.enum(["none", "suicide_imminent", "suicidal_ideation", "self_harm", "method_seeking", "medical_emergency", "abuse", "acute_distress", "diagnosis_request", "medication_advice", "dangerous_request"]),
  about_someone_else_or_hypothetical: z.boolean(),
});

const REVIEW_SYSTEM = `You are a safety classifier for Calm-1, a wellbeing companion. Classify the user's latest message for risk to the user.
Levels: none (ordinary conversation, including sadness, stress, frustration); low (asks for diagnosis); moderate (acute distress such as panic, feeling unable to cope; or medication questions); high (suicidal thoughts without a plan, self-harm, abuse, dangerous requests); critical (imminent risk: plan, means, timeframe, overdose taken, method seeking, medical emergency).
Do not escalate ordinary low mood. Figures of speech ("this job is killing me") are none. Use recent context to resolve ambiguity.`;

const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["risk_level", "category", "about_someone_else_or_hypothetical"],
  properties: {
    risk_level: { type: "string", enum: ["none", "low", "moderate", "high", "critical"] },
    category: { type: "string", enum: ModelReview.shape.category.options },
    about_someone_else_or_hypothetical: { type: "boolean" },
  },
};

function guidanceFor(category: SafetyCategory | null, severity: Severity, r: Resources): string {
  if (!category || severity === "none") return "";
  const base = "SAFETY CONTEXT (from the safety system, not the user): ";
  switch (category) {
    case "suicide_imminent":
    case "method_seeking":
    case "suicidal_ideation":
    case "self_harm":
      return `${base}The user may be at risk of suicide or self-harm (${severity}). Respond with warmth and without panic, in your own words, specific to what they said. Do not give any information about methods, means or doses. Gently ask whether they are safe right now. Encourage reaching out to a real person now and include, verbatim: "${crisisLine(r)}". Be clear you are an AI and can't contact anyone for them. No exercises or content recommendations this turn unless they ask for help calming down.`;
    case "medical_emergency":
      return `${base}This may be a medical emergency. Tell them clearly to call ${r.emergency} now. Keep it short. Do not offer breathing exercises as a substitute for emergency care.`;
    case "abuse":
      return `${base}The user may be experiencing abuse or coercion. Believe them, don't pressure them to act, don't suggest confronting the person. Mention ${r.abuse}, and ${r.emergency} if in immediate danger. Avoid suggestions that could put them at risk if their phone is checked.`;
    case "acute_distress":
      return `${base}The user is in acute distress. Slow down, be steady and brief. Offer (don't impose) one small grounding or breathing step. If distress persists or worsens, gently mention ${r.crisis}.`;
    case "diagnosis_request":
      return `${base}The user is asking for a diagnosis. You can't diagnose. Say so kindly in a sentence, suggest a GP or ${r.medicalAdvice}, then engage with what they're experiencing.`;
    case "medication_advice":
      return `${base}The user is asking about medication. Do not give doses, schedules or advice on starting/stopping/mixing medication. Suggest a pharmacist, GP or ${r.medicalAdvice}. If they may have taken too much, tell them to call ${r.emergency}.`;
    case "dangerous_request":
      return `${base}The user is asking for something that could harm them (e.g. disordered eating or hiding self-harm). Do not provide it. Respond with care, ask what's going on, and mention ${r.crisis}.`;
  }
}

function toolsFor(severity: Severity, category: SafetyCategory | null): "all" | string[] {
  if (severityRank(severity) >= severityRank("high")) return category === "abuse" ? [] : ["breathing_exercise", "grounding_exercise"];
  if (category === "medication_advice" || category === "diagnosis_request") return ["breathing_exercise", "grounding_exercise", "reflection_prompt"];
  return "all";
}

export async function assessInput(
  text: string,
  ctx: { countryCode: string | null; recent?: string[]; channel: Channel; userId?: string | null; conversationId?: string | null; modelReview?: boolean },
): Promise<InputAssessment> {
  const matches = matchRules(text);
  let severity = maxSeverity(...matches.map((m) => m.severity));
  let category = matches.sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]?.category ?? null;
  let modelReviewed = false;
  let modelSeverity: Severity | null = null;

  const settings = await getSettings();
  const shouldReview = (ctx.modelReview ?? settings.ai.modelSafetyReview) && llm().configured() && (matches.length > 0 || SOFT_SIGNALS.test(text));
  if (shouldReview) {
    try {
      const res = await llm().create({
        model: settings.ai.backgroundModel,
        system: REVIEW_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${ctx.recent?.length ? `Recent messages from the user (oldest first):\n${ctx.recent.map((m) => `- ${m}`).join("\n")}\n\n` : ""}Latest message:\n${text}`,
          },
        ],
        maxTokens: 1024,
        effort: "low",
        jsonSchema: REVIEW_SCHEMA,
        timeoutMs: 15000,
      });
      await recordCost(res, { purpose: "safety", channel: ctx.channel, userId: ctx.userId, conversationId: ctx.conversationId });
      const parsed = ModelReview.parse(JSON.parse(textOf(res.content)));
      modelReviewed = true;
      modelSeverity = parsed.about_someone_else_or_hypothetical && parsed.risk_level !== "critical" ? "low" : parsed.risk_level;
      if (severityRank(modelSeverity) > severityRank(severity)) {
        severity = modelSeverity;
        category = parsed.category === "none" ? category : parsed.category;
      } else if (severity !== "critical" && severityRank(modelSeverity) < severityRank(severity)) {
        // The model may soften a rule hit by at most one level (reduces false
        // positives) but can never clear an explicit critical match.
        severity = (["none", "low", "moderate", "high", "critical"] as Severity[])[Math.max(severityRank(severity) - 1, severityRank(modelSeverity))]!;
      }
    } catch (e) {
      log.warn("safety model review failed; using rules only", { error: errorMessage(e) });
    }
  }

  const resources = resourcesFor(ctx.countryCode);
  return {
    severity,
    category: severity === "none" ? null : category,
    matches,
    modelReviewed,
    modelSeverity,
    guidance: guidanceFor(category, severity, resources),
    allowedTools: toolsFor(severity, category),
    requireResources: severityRank(severity) >= severityRank("high") && category !== "dangerous_request",
    resources,
  };
}

const OUTPUT_CHECKS: { id: string; pattern: RegExp; when: (a: InputAssessment) => boolean }[] = [
  { id: "output.dose", pattern: /\b\d+(\.\d+)?\s?(mg|milligrams?|mcg|ml|tablets?|pills?|capsules?)\b/i, when: (a) => a.category !== null },
  { id: "output.method", pattern: /\b(lethal|fatal|overdose threshold|ligature|noose)\b/i, when: () => true },
  { id: "output.diagnosis", pattern: /\byou (have|probably have|likely have|are suffering from|definitely have)\s+(clinical )?(depression|an anxiety disorder|adhd|bipolar|ptsd|ocd|bpd|an eating disorder)\b/i, when: () => true },
  { id: "output.human_claim", pattern: /\b(i'?m|i am) (a )?(real )?(human|person|therapist|counsellor|counselor|doctor|psychologist)\b/i, when: () => true },
];

export interface OutputAssessment {
  text: string;
  action: "logged" | "resources" | "replaced" | null;
  violations: string[];
}

/** Layer 4: validate the drafted reply against the turn's risk. */
export function assessOutput(reply: string, input: InputAssessment): OutputAssessment {
  // Patterns only match positive claims ("I'm not a therapist" has "not" in between).
  const violations = OUTPUT_CHECKS.filter((c) => c.when(input) && c.pattern.test(reply)).map((c) => c.id);
  if (violations.length) {
    return { text: fallbackResponse(input.category ?? "general", input.resources), action: "replaced", violations };
  }
  if (input.requireResources) {
    const r = input.resources;
    const hasResource = reply.includes(r.emergency) || reply.toLowerCase().includes(r.crisis.split(" on ")[0]!.toLowerCase()) || /\b(116 123|988|999|911|112|000)\b/.test(reply);
    if (!hasResource) {
      const line = input.category === "medical_emergency" ? `Please call ${r.emergency} now.` : input.category === "abuse" ? `If you're in danger, call ${r.emergency}. You can also talk to ${r.abuse}.` : crisisLine(r);
      return { text: `${reply.trim()}\n\n${line}`, action: "resources", violations: [] };
    }
  }
  return { text: reply, action: null, violations: [] };
}

export async function logSafetyEvent(e: Omit<SafetyEventRow, "id" | "created_at" | "review_status" | "reviewed_by" | "reviewed_at" | "policy_version">) {
  await db().insert("safety_events", {
    ...e,
    id: uuid(),
    review_status: "unreviewed",
    reviewed_by: null,
    reviewed_at: null,
    policy_version: SAFETY_POLICY_VERSION,
    created_at: nowIso(),
  });
}

export { SAFETY_POLICY_VERSION } from "./rules";
