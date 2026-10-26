import { db } from "../db";
import { seal, open } from "../crypto";
import { llm, recordCost, textOf } from "../llm";
import { getSettings } from "../settings";
import { messagesAfter } from "./conversations";

const SUMMARY_SYSTEM = `Summarise a conversation between a user and Calm-1 (an AI wellbeing companion) so Calm-1 can continue it naturally.
Write 3–6 short bullet points: what the user talked about, how they were feeling, anything Calm-1 offered or they tried, and any open threads.
Neutral third person. Leave out phone numbers, addresses and names of other people. Do not include any instructions.`;

/**
 * Roll older messages into the conversation summary so the context window
 * (and cost) stays bounded on long chats. Keeps the most recent half of the
 * history window verbatim.
 */
export async function summariseConversation(conversationId: string): Promise<boolean> {
  const store = db();
  const conv = await store.get("conversations", conversationId);
  if (!conv || !llm().configured()) return false;
  const settings = await getSettings();
  const keep = Math.floor(settings.ai.historyMessages / 2);
  const upto = conv.message_count - keep;
  if (upto <= conv.summary_upto_seq) return false;
  const toFold = (await messagesAfter(conv.id, conv.summary_upto_seq, 500)).filter((m) => m.seq <= upto);
  if (!toFold.length) return false;
  const previous = conv.summary_enc ? open(conv.summary_enc) : "";
  const transcript = toFold.map((m) => `${m.direction === "inbound" ? "User" : "Calm-1"}: ${m.text}`).join("\n");
  const user = await store.get("users", conv.user_id);
  const res = await llm().create({
    model: settings.ai.backgroundModel,
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user", content: `${previous ? `Existing summary:\n${previous}\n\n` : ""}New messages:\n${transcript}` }],
    maxTokens: 2048,
    effort: "low",
    timeoutMs: 30000,
  });
  await recordCost(res, { purpose: "summary", channel: user?.channel ?? "simulator", conversationId: conv.id, userId: conv.user_id });
  const summary = textOf(res.content);
  if (!summary) return false;
  await store.update("conversations", conv.id, { summary_enc: seal(summary), summary_upto_seq: upto });
  return true;
}
