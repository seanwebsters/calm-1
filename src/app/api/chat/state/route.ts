import { handle, json } from "@/lib/api";
import { db } from "@/lib/db";
import { open } from "@/lib/crypto";
import { currentChatUser } from "@/lib/chat/identity";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await currentChatUser();
  if (!user) return json({ messages: [] });
  const rows = await db().find("messages", { where: { user_id: user.id }, orderBy: "created_at" });
  return json({ messages: rows.map((m) => ({ id: m.id, direction: m.direction, text: open(m.content_enc), at: m.created_at })) });
});
