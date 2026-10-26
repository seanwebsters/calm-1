import { db } from "../db";
import { nowIso, uuid } from "../ids";
import type { SessionPayload } from "./session-token";

export async function audit(
  admin: Pick<SessionPayload, "adminId" | "email"> | null,
  action: string,
  target?: { type: string; id: string | null },
  opts: { reason?: string | null; meta?: Record<string, unknown> } = {},
) {
  await db().insert("admin_audit_logs", {
    id: uuid(),
    admin_id: admin?.adminId ?? null,
    admin_email: admin?.email ?? null,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    reason: opts.reason ?? null,
    meta: opts.meta ?? {},
    created_at: nowIso(),
  });
}
