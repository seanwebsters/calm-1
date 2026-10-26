/**
 * Scheduler heartbeat for serverless deployments (Vercel Cron calls this
 * every minute). Sends due check-ins and drains the job queue.
 */
import { env } from "@/lib/env";
import { tick } from "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!env.cronSecret || auth !== `Bearer ${env.cronSecret}`) return new Response("Unauthorized", { status: 401 });
  const result = await tick(`cron-${process.env.VERCEL_REGION ?? "local"}`, 45000);
  return Response.json(result);
}
