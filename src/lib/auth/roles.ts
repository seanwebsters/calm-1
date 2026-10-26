import type { AdminRole } from "../db/types";

export const PERMISSIONS = {
  "dashboard.view": ["owner", "admin", "operator", "safety_reviewer", "analyst"],
  "analytics.view": ["owner", "admin", "operator", "safety_reviewer", "analyst"],
  "simulator.use": ["owner", "admin", "operator", "safety_reviewer"],
  /** Open a production transcript. Always requires a reason and is audited. */
  "transcripts.view": ["owner", "admin", "safety_reviewer"],
  /** See a specific production user's saved memories (support / data requests). */
  "memories.view_user": ["owner", "admin"],
  "users.manage": ["owner", "admin", "operator"],
  "users.delete": ["owner", "admin"],
  "content.manage": ["owner", "admin", "operator"],
  "checkins.manage": ["owner", "admin", "operator"],
  "personality.edit": ["owner", "admin", "operator"],
  "personality.publish": ["owner", "admin"],
  "safety.review": ["owner", "admin", "safety_reviewer"],
  "settings.manage": ["owner", "admin"],
  "team.manage": ["owner"],
  "audit.view": ["owner", "admin"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AdminRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  operator: "Operator",
  safety_reviewer: "Safety reviewer",
  analyst: "Analyst",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  owner: "Everything, including team management.",
  admin: "Configuration, publishing, deletion and audited transcript access.",
  operator: "Content, check-ins, personality drafts, user support and the simulator.",
  safety_reviewer: "Safety review, evaluations and audited transcript access for flagged conversations.",
  analyst: "Aggregated analytics only. No user-level data.",
};
