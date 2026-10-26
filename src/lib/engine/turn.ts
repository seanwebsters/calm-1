/**
 * The Calm-1 conversation engine. Channel-agnostic: the WhatsApp adapter and
 * the dashboard simulator both call `handleInbound`, then deliver `replies`.
 *
 *   persist inbound → commands → onboarding/consent → rate & cost limits →
 *   input safety → context (history, summary, memories) → Claude + tools →
 *   output validation (URLs, safety) → persist → background jobs
 */
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../db";
import type { Channel, ConversationRow, MessageRow, Severity, UserRow } from "../db/types";
import { open } from "../crypto";
import { nowIso, uuid } from "../ids";
import { llm, recordCost, spendTodayUsd, textOf, type MessageParam } from "../llm";
import { errorMessage, log } from "../log";
import { getSettings, type AppSettings } from "../settings";
import { rateLimit } from "../ratelimit";
import { getPublished } from "../personality/service";
import { composeSystemPrompt } from "../personality/prompt";
import { assessInput, assessOutput, logSafetyEvent, type InputAssessment } from "../safety/service";
import { fallbackResponse } from "../safety/resources";
import { severityRank } from "../safety/rules";
import { deleteAllMemories, deleteMemory, listMemories, renderMemories, retrieveForTurn } from "../memory/service";
import { listPreferences, markCheckinReplied, setPaused, unsubscribe } from "../checkins/service";
import { catalogueUrls } from "../content/service";
import { deleteUserData, getPreferences, recordConsent, setPreferences } from "../users/service";
import { runTool, toolDefs } from "../tools/registry";
import { enqueue } from "../jobs/queue";
import { describeLocalNow } from "../checkins/time";
import { activeConversation, appendMessage, messagesAfter, previousConversation, type PlainMessage } from "./conversations";
import { parseCommand, parseConsentReply, type Command } from "./commands";
import * as copy from "./copy";

export interface InboundInput {
  user: UserRow;
  channel: Channel;
  text: string;
  kind: "text" | "voice" | "unsupported";
  waMessageId?: string | null;
  sentAt?: string;
  /** Simulator only: override the published prompt with a draft for previews. */
  promptOverride?: { instructions: string; traits: import("../db/types").PersonalityTraits; version: number | null };
}

export interface ToolTrace {
  name: string;
  input: Record<string, unknown>;
  summary: string;
  status: "ok" | "denied" | "error";
  latencyMs: number;
}

export interface TurnDebug {
  path: "command" | "onboarding" | "ai" | "limited" | "error" | "stopped";
  command?: Command["type"];
  latencyMs: number;
  model?: string;
  promptVersion?: number | null;
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; rounds: number };
  costUsd?: number;
  tools: ToolTrace[];
  safety?: { severity: Severity; category: string | null; rules: string[]; modelReviewed: boolean; outputAction: string | null; violations: string[] };
  memoriesUsed: { kind: string; reason: string }[];
  memoryEnabled?: boolean;
  removedUrls?: number;
  error?: string;
}

export interface TurnResult {
  conversationId: string;
  inboundMessageId: string;
  replies: { text: string; messageId: string; document?: { filename: string; json: unknown } }[];
  debug: TurnDebug;
  /** The user was erased during this turn (after the reply). */
  deleted?: boolean;
}

const OUT_BASE = { wa_message_id: null, latency_ms: null, input_tokens: null, output_tokens: null, model: null, prompt_version: null, error: null } as const;

async function usage(user: UserRow, kind: string, meta: Record<string, unknown> = {}) {
  await db().insert("usage_events", { id: uuid(), user_id: user.id, channel: user.channel, kind, meta, created_at: nowIso() });
}

export async function handleInbound(input: InboundInput): Promise<TurnResult> {
  const started = Date.now();
  const store = db();
  const settings = await getSettings();
  let user = input.user;
  const conv = await activeConversation(user, input.channel);

  const inbound = await appendMessage(conv, {
    direction: "inbound",
    kind: input.kind,
    text: input.text,
    wa_message_id: input.waMessageId ?? null,
    status: "processing",
    latency_ms: null,
    input_tokens: null,
    output_tokens: null,
    model: null,
    prompt_version: null,
    safety_severity: "none",
    error: null,
    sent_at: input.sentAt,
  });
  user =
    (await store.update("users", user.id, {
      last_inbound_at: nowIso(),
      last_active_at: nowIso(),
      message_count: user.message_count + 1,
    })) ?? user;
  await usage(user, "message_in", { kind: input.kind });
  await markCheckinReplied(user.id);

  const result: TurnResult = { conversationId: conv.id, inboundMessageId: inbound.id, replies: [], debug: { path: "ai", latencyMs: 0, tools: [], memoriesUsed: [] } };
  const reply = async (text: string, extra: Partial<MessageRow> = {}, kind: MessageRow["kind"] = "text") => {
    const m = await appendMessage(conv, { ...OUT_BASE, direction: "outbound", kind, text, status: "queued", safety_severity: "none", ...extra });
    result.replies.push({ text, messageId: m.id });
    await usage(user, "message_out", { kind });
    return m;
  };
  const finish = async (status: MessageRow["status"] = "received") => {
    await store.update("messages", inbound.id, { status });
    result.debug.latencyMs = Date.now() - started;
    return result;
  };

  const retention = String(settings.privacy.messageRetentionDays);
  const command = parseCommand(input.text);

  // ---- stopped users: only START / DELETE / HELP do anything
  if (user.status === "opted_out") {
    result.debug.path = "stopped";
    if (command?.type === "start") {
      user = (await store.update("users", user.id, { status: "onboarding", onboarding_step: "awaiting_consent" }))!;
      await reply(`${copy.RESTARTED}\n\n${copy.WELCOME.replace("{retention}", retention)}`, {}, "system");
      return finish();
    }
    if (command?.type === "delete_request" || command?.type === "delete_confirm") {
      // fall through to command handling below
    } else {
      await reply(copy.STOPPED_REMINDER, {}, "system");
      return finish();
    }
  }

  if (command) {
    const handled = await runCommand(command, user, conv, settings, reply, result);
    if (handled) {
      result.debug.path = "command";
      result.debug.command = command.type;
      return finish();
    }
  }

  // ---- onboarding & consent (no AI processing before consent)
  if (user.onboarding_step !== "done") {
    result.debug.path = "onboarding";
    // Safety still applies before consent (vital interests): rules only, no model.
    const pre = await assessInput(input.text, { countryCode: user.country_code, channel: user.channel, userId: user.id, conversationId: conv.id, modelReview: false });
    if (severityRank(pre.severity) >= severityRank("high") && pre.category) {
      await store.update("messages", inbound.id, { safety_severity: pre.severity });
      await logSafetyEvent({ user_id: user.id, conversation_id: conv.id, message_id: inbound.id, channel: user.channel, category: pre.category, severity: pre.severity, layer: "input", rule_id: pre.matches[0]?.ruleId ?? null, action: "resources" });
      await reply(fallbackResponse(pre.category, pre.resources), { safety_severity: pre.severity }, "system");
    }
    if (user.onboarding_step === "new") {
      user = (await store.update("users", user.id, { onboarding_step: "awaiting_consent" }))!;
      await reply(copy.WELCOME.replace("{retention}", retention), {}, "system");
      return finish();
    }
    const answer = parseConsentReply(input.text);
    if (answer === "decline") {
      user = (await store.update("users", user.id, { status: "opted_out" }))!;
      await reply(copy.DECLINED, {}, "system");
      return finish();
    }
    if (!answer) {
      if (!result.replies.length) await reply(copy.CONSENT_REMINDER, {}, "system");
      return finish();
    }
    const source = user.channel === "whatsapp" ? "whatsapp" : user.channel === "demo" ? "demo" : "simulator";
    await recordConsent(user.id, "privacy_notice", true, settings.privacy.noticeVersion, source);
    if (answer === "memory") {
      await recordConsent(user.id, "memory", true, settings.privacy.noticeVersion, source);
      await setPreferences(user.id, { memory_enabled: true });
    }
    user = (await store.update("users", user.id, { onboarding_step: "done", status: "active" }))!;
    await usage(user, "opted_in", { memory: answer === "memory" });
    // If their very first message was substantive, answer it now rather than asking again.
    const firstInbound = await store.findOne("messages", { where: { conversation_id: conv.id, direction: "inbound" }, orderBy: "seq" });
    const firstText = firstInbound && firstInbound.id !== inbound.id ? open(firstInbound.content_enc) : "";
    if (firstText && !/^(hi|hey|hello|hiya|yo|morning|evening|good (morning|evening|afternoon)|start|test)[!. ]*$/i.test(firstText.trim()) && !parseCommand(firstText)) {
      await reply(answer === "memory" ? "Thanks – memory is on. Say MEMORY any time to see what I remember." : "Thanks – memory is off. Say MEMORY ON any time if you'd like me to remember things.", {}, "system");
      return aiTurn({ ...input, text: firstText, user }, user, conv, inbound, settings, result, reply, finish, started);
    }
    await reply(answer === "memory" ? copy.AFTER_CONSENT_MEMORY_ON : copy.AFTER_CONSENT_MEMORY_OFF, {}, "system");
    return finish();
  }

  return aiTurn(input, user, conv, inbound, settings, result, reply, finish, started);
}

type ReplyFn = (text: string, extra?: Partial<MessageRow>, kind?: MessageRow["kind"]) => Promise<MessageRow>;

async function runCommand(cmd: Command, user: UserRow, conv: ConversationRow, settings: AppSettings, reply: ReplyFn, result: TurnResult): Promise<boolean> {
  const store = db();
  const retention = String(settings.privacy.messageRetentionDays);
  const source = user.channel === "whatsapp" ? "whatsapp" : "simulator";
  switch (cmd.type) {
    case "stop":
      await unsubscribe(user, source);
      if (user.onboarding_step === "done") await recordConsent(user.id, "privacy_notice", false, settings.privacy.noticeVersion, source);
      await store.update("users", user.id, { status: "opted_out" });
      await usage(user, "opted_out");
      await reply(copy.STOPPED.replace("{retention}", retention), {}, "system");
      return true;
    case "start":
      if (user.onboarding_step !== "done") return false;
      await reply("You're all set – what's on your mind?", {}, "system");
      return true;
    case "help":
      await reply(copy.HELP, {}, "system");
      return true;
    case "delete_request":
      await reply(copy.DELETE_CONFIRM, {}, "system");
      return true;
    case "delete_confirm": {
      await reply(copy.DELETED, {}, "system");
      result.deleted = true;
      return true;
    }
    case "export": {
      const { exportUserData } = await import("../users/service");
      const data = await exportUserData(user.id);
      const m = await reply("Here's a copy of everything I hold about you, as a file.", {}, "system");
      const last = result.replies.find((r) => r.messageId === m.id);
      if (last && data) last.document = { filename: `calm-1-export-${user.anon_id}.json`, json: data };
      return true;
    }
  }
  if (user.onboarding_step !== "done") return false;
  const prefs = await getPreferences(user.id);
  switch (cmd.type) {
    case "memory_list": {
      if (!prefs.memory_enabled) {
        const n = (await listMemories(user.id)).length;
        await reply(n ? `${copy.MEMORY_DISABLED_NOTE} I still have ${n} saved from before – say FORGET ALL to remove them.` : copy.MEMORY_DISABLED_NOTE, {}, "system");
        return true;
      }
      const mems = await listMemories(user.id);
      await reply(
        mems.length
          ? `Here's what I remember:\n${mems.map((m, i) => `${i + 1}. ${m.text}${m.event_date ? ` (${m.event_date})` : ""}`).join("\n")}\n\nSay FORGET and a number to remove one, or FORGET ALL.`
          : "I haven't saved anything yet. As we talk, I'll remember things that seem helpful – you can always check here.",
        {},
        "system",
      );
      return true;
    }
    case "memory_on":
      await recordConsent(user.id, "memory", true, settings.privacy.noticeVersion, source);
      await setPreferences(user.id, { memory_enabled: true });
      await reply(copy.MEMORY_ON, {}, "system");
      return true;
    case "memory_off":
      await recordConsent(user.id, "memory", false, settings.privacy.noticeVersion, source);
      await setPreferences(user.id, { memory_enabled: false });
      await reply(copy.MEMORY_OFF, {}, "system");
      return true;
    case "forget": {
      const mems = await listMemories(user.id);
      const target = mems[cmd.index - 1];
      if (!target) {
        await reply(`I couldn't find number ${cmd.index}. Say MEMORY to see the list.`, {}, "system");
        return true;
      }
      await deleteMemory(user.id, target.id, "user");
      await reply(`Forgotten: "${target.text}".`, {}, "system");
      return true;
    }
    case "forget_all": {
      const n = await deleteAllMemories(user.id, "user");
      await reply(n ? `Done – I've forgotten all ${n} things I'd saved.` : "There was nothing saved to forget.", {}, "system");
      return true;
    }
    case "journal": {
      const entries = await store.find("journal_entries", { where: { user_id: user.id }, orderBy: "created_at", desc: true, limit: 5 });
      await reply(
        entries.length
          ? `Your latest journal entries:\n\n${entries.map((e) => `*${new Date(e.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: user.timezone })}* – ${open(e.content_enc)}`).join("\n\n")}`
          : "Your journal is empty. Just ask me to save a reflection whenever you like.",
        {},
        "system",
      );
      return true;
    }
    case "checkins_list": {
      const prefsList = await listPreferences(user.id);
      await reply(
        prefsList.length
          ? `Your check-ins:\n${prefsList.map((p) => `• ${p.kind} at ${p.local_time} (${p.frequency}${p.paused ? ", paused" : ""})`).join("\n")}\n\nSay PAUSE CHECK-INS or STOP CHECK-INS any time.`
          : "You don't have any check-ins. Just tell me if you'd like a morning, evening or bedtime check-in.",
        {},
        "system",
      );
      return true;
    }
    case "checkins_pause": {
      const n = await setPaused(user.id, true);
      await reply(n ? "Check-ins paused. Say RESUME CHECK-INS when you'd like them back." : "You don't have any check-ins set up.", {}, "system");
      return true;
    }
    case "checkins_resume": {
      const n = await setPaused(user.id, false);
      await reply(n ? "Check-ins are back on." : "You don't have any check-ins set up.", {}, "system");
      return true;
    }
    case "checkins_stop": {
      const n = await unsubscribe(user, source);
      await reply(n ? "Check-ins stopped. I won't message you unless you message me first." : "You don't have any check-ins set up.", {}, "system");
      return true;
    }
  }
  return false;
}

/** Remove any URL the reply isn't allowed to contain. */
export function scrubUrls(text: string, allowed: Set<string>): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(/https?:\/\/[^\s)>\]]+/g, (url) => {
    const clean = url.replace(/[.,;:!?]+$/, "");
    if (allowed.has(clean)) return url;
    removed++;
    return "";
  });
  return { text: out.replace(/\(\s*\)/g, "").replace(/[ \t]+\n/g, "\n").replace(/ {2,}/g, " ").trim(), removed };
}

/**
 * Conversation history for the model. Commands, consent answers and their
 * service replies (outbound "system" messages) are not conversation, so they
 * are left out; AI replies, check-ins and safety replies stay in.
 */
export function toParams(history: PlainMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i]!;
    if (!m.text) continue;
    if (m.direction === "outbound" && m.kind === "system") continue;
    if (m.direction === "inbound") {
      const next = history[i + 1];
      if (next?.direction === "outbound" && next.kind === "system" && (parseCommand(m.text) || parseConsentReply(m.text))) continue;
    }
    const role = m.direction === "inbound" ? "user" : "assistant";
    const last = out[out.length - 1];
    if (last && last.role === role && typeof last.content === "string") last.content = `${last.content}\n\n${m.text}`;
    else out.push({ role, content: m.text });
  }
  while (out[0]?.role === "assistant") out.shift();
  return out;
}

async function aiTurn(
  input: InboundInput,
  user: UserRow,
  conv: ConversationRow,
  inbound: MessageRow,
  settings: AppSettings,
  result: TurnResult,
  reply: ReplyFn,
  finish: (s?: MessageRow["status"]) => Promise<TurnResult>,
  started: number,
): Promise<TurnResult> {
  const store = db();
  const dbg = result.debug;
  dbg.path = "ai";

  // ---- limits
  const burst = await rateLimit(`user:${user.id}:burst`, 12, 60);
  const daily = await rateLimit(`user:${user.id}:day`, settings.ai.perUserDailyReplies, 86400);
  if (!burst.allowed || !daily.allowed) {
    dbg.path = "limited";
    await reply(burst.allowed ? copy.DAILY_LIMIT : copy.RATE_LIMITED, {}, "system");
    return finish();
  }
  if (settings.ai.dailyCostLimitUsd > 0 && (await spendTodayUsd()) >= settings.ai.dailyCostLimitUsd) {
    dbg.path = "limited";
    dbg.error = "Daily AI cost limit reached";
    log.error("daily AI cost limit reached", { limit: settings.ai.dailyCostLimitUsd });
    await reply(copy.UNAVAILABLE, { error: "cost_limit" }, "system");
    return finish();
  }

  // ---- context
  const prefs = await getPreferences(user.id);
  dbg.memoryEnabled = prefs.memory_enabled;
  const history = await messagesAfter(conv.id, conv.summary_upto_seq, settings.ai.historyMessages);
  const recentUser = history.filter((m) => m.direction === "inbound" && m.id !== inbound.id).slice(-4).map((m) => m.text);

  const safety = await assessInput(input.text, { countryCode: user.country_code, recent: recentUser, channel: user.channel, userId: user.id, conversationId: conv.id });
  dbg.safety = { severity: safety.severity, category: safety.category, rules: safety.matches.map((m) => m.ruleId), modelReviewed: safety.modelReviewed, outputAction: null, violations: [] };
  if (safety.severity !== "none" && safety.category) {
    await store.update("messages", inbound.id, { safety_severity: safety.severity });
    await logSafetyEvent({
      user_id: user.id,
      conversation_id: conv.id,
      message_id: inbound.id,
      channel: user.channel,
      category: safety.category,
      severity: safety.severity,
      layer: "input",
      rule_id: safety.matches[0]?.ruleId ?? (safety.modelReviewed ? "model_review" : null),
      action: safety.requireResources ? "resources" : severityRank(safety.severity) >= severityRank("moderate") ? "supportive" : "logged",
    });
  }

  const published = input.promptOverride ? null : await getPublished();
  const instructions = input.promptOverride?.instructions ?? published!.instructions;
  const traits = input.promptOverride?.traits ?? published!.traits;
  const promptVersion = input.promptOverride ? input.promptOverride.version : published!.version;
  dbg.promptVersion = promptVersion;
  const system = composeSystemPrompt(instructions, traits);

  const memories = prefs.memory_enabled ? await retrieveForTurn(user, input.text, settings.ai.memoryRetrievalLimit) : [];
  dbg.memoriesUsed = memories.map((m) => ({ kind: m.kind, reason: m.reason }));
  const summary = conv.summary_enc ? open(conv.summary_enc) : "";
  const prev = !summary && history.length <= 1 ? await previousConversation(user.id, conv.id) : null;
  const checkins = await listPreferences(user.id);

  const contextParts = [
    `Now for the user: ${describeLocalNow(user.timezone)} (${user.timezone}).`,
    `Channel: ${user.channel === "whatsapp" ? "WhatsApp" : "test simulator (treat exactly like WhatsApp)"}.`,
    prev ? `This is a new conversation; they last chatted ${Math.round((Date.now() - new Date(prev.last_message_at).getTime()) / 3600_000)} hours ago.` : "",
    summary ? `Summary of earlier in this conversation:\n${summary}` : "",
    prefs.memory_enabled ? renderMemories(memories) || "Memory is on but nothing relevant is saved." : "Memory is OFF for this user: don't imply you remember previous conversations beyond the messages shown.",
    checkins.length ? `Their check-ins: ${checkins.map((c) => `${c.kind} ${c.local_time} ${c.frequency}${c.paused ? " (paused)" : ""}`).join(", ")}.` : "They have no check-ins set up.",
    input.kind === "voice" ? "Their latest message was a voice note, transcribed automatically – allow for transcription mistakes." : "",
    safety.guidance,
  ].filter(Boolean);

  const messages = toParams(history);
  if (!messages.length || messages[messages.length - 1]!.role !== "user") messages.push({ role: "user", content: input.text });

  const model = llm();
  if (!model.configured()) {
    dbg.path = "error";
    dbg.error = "Claude is not configured (ANTHROPIC_API_KEY missing)";
    if (safety.requireResources && safety.category) await reply(fallbackResponse(safety.category, safety.resources), { safety_severity: safety.severity, error: "llm_not_configured" }, "text");
    else if (user.channel === "whatsapp") await reply(copy.UNAVAILABLE, { error: "llm_not_configured" }, "system");
    await store.update("conversations", conv.id, { had_error: true });
    return finish("failed");
  }

  // ---- model loop
  const allowedUrls = await catalogueUrls();
  const tools = toolDefs(safety.allowedTools);
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, rounds: 0 };
  let cost = 0;
  let finalText = "";
  let servedModel: string = settings.ai.model;
  let refused = false;
  try {
    for (let round = 0; round <= settings.ai.maxToolRounds; round++) {
      const lastRound = round === settings.ai.maxToolRounds;
      const res = await model.create({
        model: settings.ai.model,
        system,
        context: contextParts.join("\n\n"),
        messages,
        tools: lastRound ? [] : tools,
        maxTokens: settings.ai.maxOutputTokens,
        effort: settings.ai.effort,
        timeoutMs: settings.ai.timeoutMs,
      });
      totals.input += res.usage.input;
      totals.output += res.usage.output;
      totals.cacheRead += res.usage.cacheRead;
      totals.cacheWrite += res.usage.cacheWrite;
      totals.rounds++;
      servedModel = res.model;
      cost += await recordCost(res, { purpose: "reply", channel: user.channel, conversationId: conv.id, userId: user.id });

      if (res.stopReason === "refusal") {
        refused = true;
        break;
      }
      const toolUses = res.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (res.stopReason !== "tool_use" || !toolUses.length) {
        finalText = textOf(res.content);
        break;
      }
      messages.push({ role: "assistant", content: res.content });
      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const t0 = Date.now();
        const out = await runTool(tu.name, tu.input, { user, conversation: conv, allowed: safety.allowedTools });
        const latency = Date.now() - t0;
        for (const u of out.urls ?? []) allowedUrls.add(u);
        dbg.tools.push({ name: tu.name, input: out.loggedInput, summary: out.summary, status: out.status, latencyMs: latency });
        await store.insert("tool_invocations", {
          id: uuid(),
          conversation_id: conv.id,
          message_id: inbound.id,
          user_id: user.id,
          tool: tu.name,
          input: out.loggedInput,
          output_summary: out.summary,
          status: out.status,
          latency_ms: latency,
          created_at: nowIso(),
        });
        if (out.status === "denied" && out.summary.startsWith("denied:safety")) {
          await logSafetyEvent({ user_id: user.id, conversation_id: conv.id, message_id: inbound.id, channel: user.channel, category: safety.category ?? "tool_restriction", severity: safety.severity, layer: "tool", rule_id: `tool.${tu.name}`, action: "logged" });
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out.result), ...(out.status === "error" ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    dbg.path = "error";
    dbg.error = errorMessage(e);
    log.error("model call failed", { conversationId: conv.id, error: dbg.error });
    const withResources = safety.requireResources && safety.category;
    const text = withResources ? fallbackResponse(safety.category!, safety.resources) : copy.UNAVAILABLE;
    await reply(text, { error: dbg.error.slice(0, 300), safety_severity: safety.severity }, withResources ? "text" : "system");
    await store.update("conversations", conv.id, { had_error: true });
    return finish("failed");
  }

  dbg.model = servedModel;
  dbg.usage = totals;
  dbg.costUsd = cost;

  if (refused || !finalText) {
    finalText = safety.category ? fallbackResponse(safety.category, safety.resources) : "Sorry, I lost my words for a second there. Could you say that again?";
    if (refused) dbg.error = "Model declined (refusal)";
  }

  // ---- output validation
  const scrubbed = scrubUrls(finalText, allowedUrls);
  dbg.removedUrls = scrubbed.removed;
  const checked = assessOutput(scrubbed.text, safety);
  dbg.safety.outputAction = checked.action;
  dbg.safety.violations = checked.violations;
  if (checked.action || scrubbed.removed) {
    await logSafetyEvent({
      user_id: user.id,
      conversation_id: conv.id,
      message_id: inbound.id,
      channel: user.channel,
      category: checked.violations[0] ?? (scrubbed.removed ? "unapproved_url" : safety.category ?? "output"),
      severity: checked.action === "replaced" ? maxSev(safety.severity, "moderate") : safety.severity === "none" ? "low" : safety.severity,
      layer: "output",
      rule_id: checked.violations[0] ?? (scrubbed.removed ? "output.url" : "output.resources"),
      action: checked.action ?? "replaced",
    });
  }

  await reply(checked.text, {
    latency_ms: Date.now() - started,
    input_tokens: totals.input + totals.cacheRead + totals.cacheWrite,
    output_tokens: totals.output,
    model: servedModel,
    prompt_version: promptVersion,
    safety_severity: safety.severity,
  });

  // ---- background work
  if (prefs.memory_enabled && input.kind !== "unsupported") {
    await enqueue("memory.extract", { userId: user.id, messageId: inbound.id, conversationId: conv.id }, { lockKey: `memory:${user.id}` });
  }
  const unsummarised = (conv.message_count ?? 0) - conv.summary_upto_seq;
  if (unsummarised > settings.ai.summariseAfterMessages) {
    await enqueue("conversation.summarise", { conversationId: conv.id }, { lockKey: `summary:${conv.id}` });
  }
  return finish();
}

function maxSev(a: Severity, b: Severity): Severity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

/** Called by the channel after delivering replies when the user asked for deletion. */
export async function completeDeletion(userId: string, via: "whatsapp" | "simulator" | "admin") {
  return deleteUserData(userId, via, null);
}
