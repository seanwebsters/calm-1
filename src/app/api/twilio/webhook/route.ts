/**
 * Twilio WhatsApp inbound webhook ("When a message comes in" in the Twilio
 * console / Sandbox settings). Validates X-Twilio-Signature, queues the
 * message, and replies with empty TwiML; Calm-1's answer is sent separately
 * so slow model calls never hit Twilio's 15-second timeout.
 */
import { after } from "next/server";
import { errorMessage, log } from "@/lib/log";
import { verifyTwilioSignature } from "@/lib/twilio/client";
import { ingestTwilioMessage } from "@/lib/twilio/adapter";
import { candidateUrls, formParams } from "@/lib/twilio/request";
import { env } from "@/lib/env";
import { kickWorker } from "@/lib/jobs/inprocess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request) {
  const params = await formParams(req);
  const sig = req.headers.get("x-twilio-signature");
  if (!candidateUrls(req).some((u) => verifyTwilioSignature(u, params, sig))) {
    log.warn("twilio webhook signature rejected", { tokenConfigured: !!env.twilioAuthToken, urls: candidateUrls(req).join(" | ") });
    return new Response("Invalid signature", { status: 403 });
  }
  try {
    const r = await ingestTwilioMessage(params);
    if (r.queued) after(() => kickWorker());
    return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
  } catch (e) {
    log.error("twilio webhook failed", { error: errorMessage(e) });
    return new Response("Error", { status: 500 });
  }
}
