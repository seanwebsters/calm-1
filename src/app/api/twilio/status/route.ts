/** Twilio delivery status callbacks (sent / delivered / read / failed). */
import { verifyTwilioSignature } from "@/lib/twilio/client";
import { applyTwilioStatus } from "@/lib/twilio/adapter";
import { formParams, publicUrl } from "@/lib/twilio/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const params = await formParams(req);
  if (!verifyTwilioSignature(publicUrl(req), params, req.headers.get("x-twilio-signature"))) return new Response("Invalid signature", { status: 403 });
  await applyTwilioStatus(params);
  return new Response(null, { status: 204 });
}
