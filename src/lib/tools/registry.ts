/**
 * Wellbeing tools Claude can call. Each tool declares its schema, a handler
 * and a permission check. Inputs are validated with zod before running, and
 * only a minimised form of the input is logged (never free text).
 */
import { z } from "zod";
import { db } from "../db";
import type { ConversationRow, UserRow } from "../db/types";
import { seal } from "../crypto";
import { nowIso, uuid } from "../ids";
import type { ToolDef } from "../llm";
import { getSettings } from "../settings";
import { hasConsent, recordConsent, setPreferences } from "../users/service";
import { searchContent } from "../content/service";
import { setPaused, subscribe, unsubscribe } from "../checkins/service";
import { BREATHING, GROUNDING, REFLECTION, SLEEP } from "./exercises";

export interface ToolContext {
  user: UserRow;
  conversation: ConversationRow;
  allowed: "all" | string[];
}

export interface ToolOutcome {
  /** Returned to the model. */
  result: unknown;
  /** Short, content-free description for logs and the dashboard. */
  summary: string;
  /** Safe-to-log input. */
  loggedInput: Record<string, unknown>;
  status?: "ok" | "denied" | "error";
  /** URLs the reply is allowed to contain because this tool returned them. */
  urls?: string[];
}

interface ToolSpec<S extends z.ZodTypeAny> {
  def: ToolDef;
  schema: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutcome>;
}

function tool<S extends z.ZodTypeAny>(name: string, description: string, schema: S, jsonSchema: Record<string, unknown>, run: ToolSpec<S>["run"]): ToolSpec<S> {
  return {
    def: { name, description, input_schema: { type: "object", additionalProperties: false, ...jsonSchema } as ToolDef["input_schema"], strict: true },
    schema,
    run,
  };
}

const breathing = tool(
  "breathing_exercise",
  "Get a short, vetted breathing exercise to guide the user through. Use when they want to calm down, feel anxious, or are winding down.",
  z.object({ style: z.enum(["box", "slow", "wind_down"]) }),
  { required: ["style"], properties: { style: { type: "string", enum: ["box", "slow", "wind_down"], description: "box: steadying; slow: quick calm with long out-breath; wind_down: before sleep" } } },
  async ({ style }) => ({ result: BREATHING[style], summary: `breathing:${style}`, loggedInput: { style } }),
);

const grounding = tool(
  "grounding_exercise",
  "Get a short grounding exercise for when the user feels anxious, panicky, dissociated or overwhelmed.",
  z.object({ style: z.enum(["five_senses", "feet_on_floor", "hand_on_chest"]) }),
  { required: ["style"], properties: { style: { type: "string", enum: ["five_senses", "feet_on_floor", "hand_on_chest"] } } },
  async ({ style }) => ({ result: GROUNDING[style], summary: `grounding:${style}`, loggedInput: { style } }),
);

const sleep = tool(
  "sleep_support",
  "Get vetted sleep support steps: a wind-down routine, help with a racing mind, waking in the night, or building a bedtime routine.",
  z.object({ need: z.enum(["wind_down", "racing_mind", "woke_up", "bedtime_routine"]) }),
  { required: ["need"], properties: { need: { type: "string", enum: ["wind_down", "racing_mind", "woke_up", "bedtime_routine"] } } },
  async ({ need }) => ({ result: SLEEP[need], summary: `sleep:${need}`, loggedInput: { need } }),
);

const reflection = tool(
  "reflection_prompt",
  "Get a gentle reflection question to help the user reflect on their day, gratitude, letting go, or small goals.",
  z.object({ focus: z.enum(["day", "gratitude", "letting_go", "goals"]) }),
  { required: ["focus"], properties: { focus: { type: "string", enum: ["day", "gratitude", "letting_go", "goals"] } } },
  async ({ focus }) => {
    const options = REFLECTION[focus];
    return { result: { question: options[Math.floor(Math.random() * options.length)] }, summary: `reflection:${focus}`, loggedInput: { focus } };
  },
);

const content = tool(
  "search_calm_content",
  "Search the approved Calm content catalogue. Only recommend items this returns, with their exact title and url. Returns an empty list if nothing approved matches.",
  z.object({ query: z.string().max(200), category: z.enum(["sleep", "meditation", "breathing", "music", "stories", "movement", "focus", "any"]) }),
  {
    required: ["query", "category"],
    properties: {
      query: { type: "string", description: "A few keywords describing what would help, e.g. 'sleep racing mind'" },
      category: { type: "string", enum: ["sleep", "meditation", "breathing", "music", "stories", "movement", "focus", "any"] },
    },
  },
  async ({ query, category }, ctx) => {
    const items = await searchContent(query, { category: category === "any" ? undefined : category, language: ctx.user.language, limit: 3 });
    return {
      result: { items: items.map((i) => ({ title: i.title, description: i.description, duration_minutes: i.duration_minutes, url: i.url, category: i.category })) },
      summary: `content:${category}:${items.length} results`,
      loggedInput: { category, results: items.map((i) => i.id) },
      urls: items.map((i) => i.url),
    };
  },
);

const journal = tool(
  "save_journal_entry",
  "Save a reflection to the user's private journal. Only call when the user explicitly asks to save or journal something. If they haven't enabled the journal yet, the tool says so; ask them to confirm, then call again with user_confirmed_journal: true.",
  z.object({ text: z.string().min(1).max(4000), user_confirmed_journal: z.boolean() }),
  {
    required: ["text", "user_confirmed_journal"],
    properties: {
      text: { type: "string", description: "The reflection, in the user's own words." },
      user_confirmed_journal: { type: "boolean", description: "True only if the user has just explicitly agreed to turn on their private journal." },
    },
  },
  async ({ text, user_confirmed_journal }, ctx) => {
    const settings = await getSettings();
    if (!(await hasConsent(ctx.user.id, "journal"))) {
      if (!user_confirmed_journal) {
        return {
          result: { saved: false, needs_consent: true, explain: "Their journal is private, encrypted, only visible to them (say 'journal' to see it), and they can delete it any time. Ask if they'd like to turn it on." },
          summary: "journal:needs_consent",
          loggedInput: {},
          status: "denied",
        };
      }
      await recordConsent(ctx.user.id, "journal", true, settings.privacy.noticeVersion, ctx.user.channel === "whatsapp" ? "whatsapp" : "simulator");
      await setPreferences(ctx.user.id, { journal_enabled: true });
    }
    await db().insert("journal_entries", { id: uuid(), user_id: ctx.user.id, content_enc: seal(text)!, created_at: nowIso() });
    return { result: { saved: true }, summary: "journal:saved", loggedInput: { length: text.length } };
  },
);

const checkins = tool(
  "update_checkins",
  "Change the user's scheduled check-ins. Only call when the user clearly asks to start, pause, resume or stop check-ins. Times are 24h HH:MM in the user's timezone.",
  z.object({
    action: z.enum(["subscribe", "pause", "resume", "unsubscribe"]),
    kind: z.enum(["morning", "evening", "bedtime", "all"]),
    local_time: z.string().nullable(),
    frequency: z.enum(["daily", "weekdays", "weekly"]).nullable(),
  }),
  {
    required: ["action", "kind", "local_time", "frequency"],
    properties: {
      action: { type: "string", enum: ["subscribe", "pause", "resume", "unsubscribe"] },
      kind: { type: "string", enum: ["morning", "evening", "bedtime", "all"] },
      local_time: { type: ["string", "null"], description: "HH:MM for subscribe; null to use the default" },
      frequency: { type: ["string", "null"], enum: ["daily", "weekdays", "weekly", null] },
    },
  },
  async (input, ctx) => {
    const kind = input.kind === "all" ? undefined : input.kind;
    const source = ctx.user.channel === "whatsapp" ? "whatsapp" : "simulator";
    if (input.action === "subscribe") {
      if (!kind) return { result: { ok: false, error: "Pick morning, evening or bedtime" }, summary: "checkins:invalid", loggedInput: { action: input.action }, status: "denied" };
      try {
        const p = await subscribe(ctx.user, { kind, local_time: input.local_time ?? undefined, frequency: input.frequency ?? "daily" }, source);
        return { result: { ok: true, kind: p.kind, time: p.local_time, timezone: p.timezone, frequency: p.frequency, note: "Tell them they can say 'pause check-ins' or 'stop check-ins' any time." }, summary: `checkins:subscribe:${kind}`, loggedInput: { action: "subscribe", kind, frequency: p.frequency } };
      } catch (e) {
        return { result: { ok: false, error: e instanceof Error ? e.message : String(e) }, summary: "checkins:error", loggedInput: { action: "subscribe", kind }, status: "denied" };
      }
    }
    if (input.action === "unsubscribe") {
      const n = await unsubscribe(ctx.user, source, kind);
      return { result: { ok: true, stopped: n }, summary: `checkins:unsubscribe:${input.kind}`, loggedInput: { action: "unsubscribe", kind: input.kind } };
    }
    const n = await setPaused(ctx.user.id, input.action === "pause", kind);
    return { result: { ok: true, updated: n }, summary: `checkins:${input.action}:${input.kind}`, loggedInput: { action: input.action, kind: input.kind } };
  },
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOOLS: ToolSpec<any>[] = [breathing, grounding, sleep, reflection, content, journal, checkins];

export const TOOL_NAMES = TOOLS.map((t) => t.def.name);

export function toolDefs(allowed: "all" | string[]): ToolDef[] {
  return TOOLS.filter((t) => allowed === "all" || allowed.includes(t.def.name)).map((t) => t.def);
}

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome & { status: "ok" | "denied" | "error" }> {
  const spec = TOOLS.find((t) => t.def.name === name);
  if (!spec) return { result: { error: `Unknown tool ${name}` }, summary: "unknown_tool", loggedInput: {}, status: "error" };
  if (ctx.allowed !== "all" && !ctx.allowed.includes(name)) {
    return { result: { error: "This tool isn't available right now. Focus on the person and their safety." }, summary: "denied:safety_restriction", loggedInput: {}, status: "denied" };
  }
  const parsed = spec.schema.safeParse(rawInput);
  if (!parsed.success) return { result: { error: "Invalid input", issues: parsed.error.issues.map((i: { message: string }) => i.message) }, summary: "invalid_input", loggedInput: {}, status: "error" };
  try {
    const out = await spec.run(parsed.data, ctx);
    return { ...out, status: out.status ?? "ok" };
  } catch (e) {
    return { result: { error: "The tool failed. Carry on without it." }, summary: `error:${e instanceof Error ? e.message.slice(0, 80) : "unknown"}`, loggedInput: {}, status: "error" };
  }
}
