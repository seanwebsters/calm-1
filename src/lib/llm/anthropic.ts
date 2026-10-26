import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { NotConfiguredError } from "../errors";
import type { Llm, LlmRequest, LlmResponse } from "./types";

/**
 * Claude adapter. Notes on the request shape:
 *  - The stable system prompt carries a cache breakpoint so repeated turns
 *    reuse it; per-user context (memories, time, summary) goes in a second
 *    system block after it.
 *  - Claude Opus 5.5 always thinks; depth is controlled with effort (we use
 *    "low" for conversational replies to keep WhatsApp latency down).
 *  - Server-side refusal fallback is enabled (`fallbacks: "default"`) so a
 *    classifier decline is retried on Anthropic's recommended model instead
 *    of leaving the user without a reply.
 */
export class AnthropicLlm implements Llm {
  readonly name = "anthropic";
  private client: Anthropic | null = null;

  configured() {
    return !!env.anthropicApiKey;
  }

  private sdk(): Anthropic {
    if (!this.configured()) throw new NotConfiguredError("Claude", ["ANTHROPIC_API_KEY"]);
    this.client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2 });
    return this.client;
  }

  async create(req: LlmRequest): Promise<LlmResponse> {
    const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }];
    if (req.context) system.push({ type: "text", text: req.context });
    const supportsFallback = !req.model.startsWith("claude-haiku");
    const started = Date.now();
    const res = await this.sdk().beta.messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        system,
        messages: req.messages,
        ...(req.tools?.length ? { tools: req.tools, tool_choice: { type: "auto" as const } } : {}),
        output_config: {
          ...(req.effort ? { effort: req.effort } : {}),
          ...(req.jsonSchema ? { format: { type: "json_schema" as const, schema: req.jsonSchema } } : {}),
        },
        ...(supportsFallback ? { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] } : {}),
      },
      { timeout: req.timeoutMs ?? 45000 },
    );
    return {
      content: res.content,
      stopReason: res.stop_reason,
      usage: {
        input: res.usage.input_tokens,
        output: res.usage.output_tokens,
        cacheRead: res.usage.cache_read_input_tokens ?? 0,
        cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
      },
      model: res.model,
      latencyMs: Date.now() - started,
    };
  }

  /** Lightweight health check: the Models API needs a valid key but costs nothing. */
  async ping(model: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const t = Date.now();
    try {
      await this.sdk().models.retrieve(model);
      return { ok: true, latencyMs: Date.now() - t };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t, error: e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e) };
    }
  }
}

export function isRetryableLlmError(e: unknown): boolean {
  if (e instanceof Anthropic.RateLimitError) return true;
  if (e instanceof Anthropic.InternalServerError) return true;
  if (e instanceof Anthropic.APIConnectionError) return true;
  if (e instanceof Anthropic.APIError) return (e.status ?? 0) >= 500 || e.status === 529;
  return false;
}
