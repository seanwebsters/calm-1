import { after } from "next/server";
import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { handleInbound } from "@/lib/engine/turn";
import { deleteUserData } from "@/lib/users/service";
import { getOrCreateChatUser, clearChatCookie } from "@/lib/chat/identity";
import { kickWorker } from "@/lib/jobs/inprocess";
import { rateLimit } from "@/lib/ratelimit";
import { RateLimitedError } from "@/lib/errors";

export const maxDuration = 120;

/** Public test chat: same engine as WhatsApp; limits and the daily spend cap still apply. */
export const POST = handle(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await rateLimit(`chat-ip:${ip}`, 30, 60);
  if (!rl.allowed) throw new RateLimitedError(rl.retryAfterSeconds);
  const { text } = await parseBody(req, z.object({ text: z.string().trim().min(1).max(2000) }));
  const user = await getOrCreateChatUser();
  const result = await handleInbound({ user, channel: "simulator", text, kind: "text" });
  if (result.deleted) {
    await deleteUserData(user.id, "simulator", null);
    await clearChatCookie();
  }
  after(() => kickWorker());
  return json({ replies: result.replies.map((r) => ({ id: r.messageId, text: r.text })), deleted: !!result.deleted, error: result.debug.path === "error" ? "Calm-1 couldn't reply just now." : null });
});
