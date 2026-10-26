/** Twilio delivery status callbacks (sent / delivered / read / failed). */
import { verifyTwilioSignature } from "@/lib/twilio/client";
import { applyTwilioStatus } from "@/lib/twilio/adapter";
import { candidateUrls, formParams } from "@/lib/twilio/request";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const params = await formParams(req);
  const sig = req.headers.get("x-twilio-signature");
  if (!env.twilioAuthToken || !candidateUrls(req).some((u) => verifyTwilioSignature(u, params, sig))) return new Response("Invalid signature", { status: 403 });
  await applyTwilioStatus(params);
  return new Response(null, { status: 204 });
}
