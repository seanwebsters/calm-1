import { handle, json } from "@/lib/api";
import { currentAdmin, signOut } from "@/lib/auth/session";
import { audit } from "@/lib/auth/audit";

export const POST = handle(async () => {
  const admin = await currentAdmin();
  if (admin) await audit(admin, "auth.sign_out");
  await signOut();
  return json({ ok: true });
});
