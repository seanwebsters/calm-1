import { setStore } from "@/lib/db";
import { LocalStore } from "@/lib/db/local";
import { setLlm, type Llm, type LlmRequest, type LlmResponse } from "@/lib/llm";
import { clearSettingsCache } from "@/lib/settings";
import { clearPersonalityCache } from "@/lib/personality/service";
import { resetRateLimits } from "@/lib/ratelimit";

export function freshStore() {
  const store = new LocalStore();
  setStore(store);
  clearSettingsCache();
  clearPersonalityCache();
  resetRateLimits();
  return store;
}

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };

export interface FakeTurn {
  blocks: Block[];
  stop?: string;
}

/**
 * Scripted stand-in for Claude. `reply` decides the conversational answer;
 * structured requests (memory extraction, safety review) go to their own
 * handlers. Every request is recorded for assertions.
 */
export class FakeLlm implements Llm {
  readonly name = "fake";
  requests: LlmRequest[] = [];
  constructor(
    public handlers: {
      reply?: (req: LlmRequest, round: number) => FakeTurn | string;
      extract?: (req: LlmRequest) => unknown;
      review?: (req: LlmRequest) => unknown;
      summary?: (req: LlmRequest) => string;
    } = {},
  ) {}
  configured() {
    return true;
  }
  async create(req: LlmRequest): Promise<LlmResponse> {
    this.requests.push(structuredClone(req));
    const sys = req.system;
    let blocks: Block[];
    let stop = "end_turn";
    if (req.jsonSchema && sys.startsWith("You decide what a wellbeing companion")) {
      blocks = [{ type: "text", text: JSON.stringify(this.handlers.extract?.(req) ?? { memories: [] }) }];
    } else if (req.jsonSchema && sys.startsWith("You are a safety classifier")) {
      blocks = [{ type: "text", text: JSON.stringify(this.handlers.review?.(req) ?? { risk_level: "none", category: "none", about_someone_else_or_hypothetical: false }) }];
    } else if (sys.startsWith("Summarise a conversation")) {
      blocks = [{ type: "text", text: this.handlers.summary?.(req) ?? "- summary" }];
    } else {
      const round = req.messages.filter((m) => m.role === "assistant" && Array.isArray(m.content)).length;
      const r = this.handlers.reply?.(req, round) ?? "Okay.";
      const turn = typeof r === "string" ? { blocks: [{ type: "text" as const, text: r }] } : r;
      blocks = turn.blocks;
      stop = turn.stop ?? (blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn");
    }
    return {
      content: blocks.map((b) => (b.type === "text" ? { ...b, citations: null } : b)) as never,
      stopReason: stop,
      usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0 },
      model: req.model,
      latencyMs: 5,
    };
  }
  replyRequests() {
    return this.requests.filter((r) => !r.jsonSchema && !r.system.startsWith("Summarise"));
  }
}

export function useFakeLlm(handlers: ConstructorParameters<typeof FakeLlm>[0] = {}) {
  const f = new FakeLlm(handlers);
  setLlm(f);
  return f;
}

export function lastUserText(req: LlmRequest): string {
  const m = [...req.messages].reverse().find((x) => x.role === "user");
  if (!m) return "";
  return typeof m.content === "string" ? m.content : "";
}
