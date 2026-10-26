/** Unauthenticated liveness probe – reveals nothing about configuration. */
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true });
}
