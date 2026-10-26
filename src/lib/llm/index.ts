import { db } from "../db";
import type { ApiCostRow, Channel } from "../db/types";
import { nowIso, uuid } from "../ids";
import { AnthropicLlm } from "./anthropic";
import { estimateCostUsd } from "./pricing";
import type { Llm, LlmResponse } from "./types";

export * from "./types";

const g = globalThis as unknown as { __calm1Llm?: Llm };

export function llm(): Llm {
  return (g.__calm1Llm ??= new AnthropicLlm());
}

/** Tests inject a scripted model here. */
export function setLlm(impl: Llm | undefined) {
  g.__calm1Llm = impl;
}

export async function recordCost(
  res: LlmResponse,
  meta: { purpose: ApiCostRow["purpose"]; channel: Channel | "admin"; conversationId?: string | null; userId?: string | null },
): Promise<number> {
  const cost = estimateCostUsd(res.model, res.usage);
  await db().insert("api_costs", {
    id: uuid(),
    provider: "anthropic",
    model: res.model,
    purpose: meta.purpose,
    channel: meta.channel,
    conversation_id: meta.conversationId ?? null,
    user_id: meta.userId ?? null,
    input_tokens: res.usage.input,
    output_tokens: res.usage.output,
    cache_read_tokens: res.usage.cacheRead,
    cache_write_tokens: res.usage.cacheWrite,
    cost_usd: Number(cost.toFixed(6)),
    estimated: true,
    latency_ms: res.latencyMs,
    created_at: nowIso(),
  });
  return cost;
}

export async function spendTodayUsd(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const rows = await db().find("api_costs", { gte: { created_at: start.toISOString() }, columns: ["cost_usd"] });
  return rows.reduce((s, r) => s + Number(r.cost_usd), 0);
}
