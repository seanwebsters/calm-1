import type { JobRow, TableName, Tables } from "./types";

export interface Query<T> {
  where?: Partial<T>;
  in?: { [K in keyof T]?: ReadonlyArray<T[K]> };
  neq?: Partial<T>;
  gte?: { [K in keyof T]?: string | number };
  lt?: { [K in keyof T]?: string | number };
  isNull?: (keyof T & string)[];
  notNull?: (keyof T & string)[];
  orderBy?: keyof T & string;
  desc?: boolean;
  limit?: number;
  offset?: number;
  /** Restrict returned columns (rows are then partial – only use with care). */
  columns?: (keyof T & string)[];
}

export class DuplicateError extends Error {
  constructor(table: string, column: string) {
    super(`Duplicate value for ${table}.${column}`);
  }
}

/** Columns with UNIQUE constraints (mirrored in the SQL migration). */
export const UNIQUE: { [K in TableName]?: (keyof Tables[K] & string)[] } = {
  users: ["anon_id", "phone_hash"],
  user_preferences: ["user_id"],
  webhook_events: ["external_id"],
  prompt_versions: ["version"],
  admin_users: ["email"],
  message_templates: ["name"],
  checkin_schedules: ["preference_id"],
};

/**
 * Storage interface implemented by the Supabase (production) and local
 * JSON/in-memory (development, tests) backends. Business logic only ever
 * talks to this interface.
 */
export interface Store {
  readonly kind: "supabase" | "local" | "memory";
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>;
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  find<K extends TableName>(table: K, q?: Query<Tables[K]>): Promise<Tables[K][]>;
  findOne<K extends TableName>(table: K, q: Query<Tables[K]>): Promise<Tables[K] | null>;
  count<K extends TableName>(table: K, q?: Query<Tables[K]>): Promise<number>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K] | null>;
  updateWhere<K extends TableName>(table: K, where: Partial<Tables[K]>, patch: Partial<Tables[K]>): Promise<number>;
  remove<K extends TableName>(table: K, id: string): Promise<void>;
  removeWhere<K extends TableName>(table: K, where: Partial<Tables[K]>): Promise<number>;
  /**
   * Atomically claim up to `limit` due jobs. A job whose lock_key has an
   * earlier queued/running job is skipped so per-user work stays ordered.
   */
  claimJobs(workerId: string, limit: number, now: string): Promise<JobRow[]>;
  ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }>;
}

export function matches<T>(row: T, q: Query<T> | undefined): boolean {
  if (!q) return true;
  const r = row as Record<string, unknown>;
  if (q.where) for (const [k, v] of Object.entries(q.where)) if (v !== undefined && r[k] !== v) return false;
  if (q.neq) for (const [k, v] of Object.entries(q.neq)) if (v !== undefined && r[k] === v) return false;
  if (q.in) for (const [k, vs] of Object.entries(q.in)) if (vs && !(vs as unknown[]).includes(r[k])) return false;
  if (q.gte) for (const [k, v] of Object.entries(q.gte)) if (v !== undefined && v !== null && !(r[k] !== null && r[k] !== undefined && (r[k] as string | number) >= v)) return false;
  if (q.lt) for (const [k, v] of Object.entries(q.lt)) if (v !== undefined && v !== null && !(r[k] !== null && r[k] !== undefined && (r[k] as string | number) < v)) return false;
  if (q.isNull) for (const k of q.isNull) if (r[k] !== null && r[k] !== undefined) return false;
  if (q.notNull) for (const k of q.notNull) if (r[k] === null || r[k] === undefined) return false;
  return true;
}

export function applyOrderAndPage<T>(rows: T[], q: Query<T> | undefined): T[] {
  let out = rows;
  if (q?.orderBy) {
    const k = q.orderBy;
    const dir = q.desc ? -1 : 1;
    out = [...out].sort((a, b) => {
      const av = (a as Record<string, unknown>)[k] as string | number | null;
      const bv = (b as Record<string, unknown>)[k] as string | number | null;
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      return av < bv ? -dir : dir;
    });
  }
  const start = q?.offset ?? 0;
  return q?.limit !== undefined ? out.slice(start, start + q.limit) : start ? out.slice(start) : out;
}
