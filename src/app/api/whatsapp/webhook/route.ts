/**
 * Meta WhatsApp Cloud API webhook.
 *  GET  – verification handshake (hub.challenge)
 *  POST – signature-validated events. We only validate, de-duplicate and
 *         enqueue here, then return 200 quickly; replies are produced by the
 *         job worker so slow model calls never cause Meta to retry.
 */
import { after } from "next/server";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/log";
import { rateLimit } from "@/lib/ratelimit";
import { verifyChallenge, verifySignature } from "@/lib/whatsapp/webhook";
import { ingestWebhook } from "@/lib/whatsapp/adapter";
import { kickWorker } from "@/lib/jobs/inprocess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const challenge = verifyChallenge(new URL(req.url).searchParams);
  if (challenge === null) return new Response("Forbidden", { status: 403 });
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    log.warn("whatsapp webhook signature rejected", { configured: !!env.whatsappAppSecret });
    return new Response("Invalid signature", { status: 401 });
  }
  const rl = await rateLimit("webhook:whatsapp", 2000, 60);
  if (!rl.allowed) return new Response("Too many requests", { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  try {
    const r = await ingestWebhook(body);
    // Process right after responding (Vercel keeps the function alive for `after`).
    if (r.queued) after(() => kickWorker());
    return Response.json({ ok: true, ...r });
  } catch (e) {
    log.error("whatsapp webhook processing failed", { error: errorMessage(e) });
    // 500 makes Meta retry; duplicates are dropped by webhook_events.
    return new Response("Error", { status: 500 });
  }
}
