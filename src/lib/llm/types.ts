import type Anthropic from "@anthropic-ai/sdk";

export type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
export type ToolDef = Anthropic.Beta.Messages.BetaTool;

export interface LlmUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface LlmRequest {
  model: string;
  /** Stable system prompt (cached). */
  system: string;
  /** Per-request context appended after the cached prefix. */
  context?: string;
  messages: MessageParam[];
  tools?: ToolDef[];
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  /** Structured output: JSON schema the response text must satisfy. */
  jsonSchema?: Record<string, unknown>;
}

export interface LlmResponse {
  content: ContentBlock[];
  stopReason: string | null;
  usage: LlmUsage;
  /** Model that actually served the turn (may differ after a refusal fallback). */
  model: string;
  latencyMs: number;
}

export interface Llm {
  readonly name: string;
  configured(): boolean;
  create(req: LlmRequest): Promise<LlmResponse>;
}

export function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
