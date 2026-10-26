import { z } from "zod";
import { handle, json, parseBody } from "@/lib/api";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/ratelimit";
import { RateLimitedError } from "@/lib/errors";
import { signInLocal, signInSupabase } from "@/lib/auth/session";

export const POST = handle(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = await rateLimit(`login:${ip}`, 10, 300);
  if (!rl.allowed) throw new RateLimitedError(rl.retryAfterSeconds);
  if (env.authProvider === "supabase") {
    const { email, password } = await parseBody(req, z.object({ email: z.string().email(), password: z.string().min(1) }));
    await signInSupabase(email, password);
  } else {
    const { passcode } = await parseBody(req, z.object({ passcode: z.string().default("") }));
    await signInLocal(passcode);
  }
  return json({ ok: true });
});
