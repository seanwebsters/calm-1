import { handle, json } from "@/lib/api";
import { currentChatUser, clearChatCookie } from "@/lib/chat/identity";
import { deleteUserData } from "@/lib/users/service";

/** "Start over": erase this tester's data and forget the identity. */
export const POST = handle(async () => {
  const user = await currentChatUser();
  if (user) await deleteUserData(user.id, "simulator", null);
  await clearChatCookie();
  return json({ ok: true });
});
