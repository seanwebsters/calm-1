/**
 * Supabase (PostgreSQL) store. Uses the service-role key on the server only;
 * every table has RLS enabled with no anon/authenticated write policies, so
 * the browser can never touch data directly.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JobRow, TableName, Tables } from "./types";
import { DuplicateError, type Query, type Store } from "./store";

const PAGE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Builder = any;

function applyFilters<T>(qb: Builder, q: Query<T> | undefined): Builder {
  if (!q) return qb;
  if (q.where) for (const [k, v] of Object.entries(q.where)) if (v !== undefined) qb = v === null ? qb.is(k, null) : qb.eq(k, v);
  if (q.neq) for (const [k, v] of Object.entries(q.neq)) if (v !== undefined) qb = qb.neq(k, v);
  if (q.in) for (const [k, vs] of Object.entries(q.in)) if (vs) qb = qb.in(k, vs as unknown[]);
  if (q.gte) for (const [k, v] of Object.entries(q.gte)) if (v !== undefined) qb = qb.gte(k, v);
  if (q.lt) for (const [k, v] of Object.entries(q.lt)) if (v !== undefined) qb = qb.lt(k, v);
  if (q.isNull) for (const k of q.isNull) qb = qb.is(k, null);
  if (q.notNull) for (const k of q.notNull) qb = qb.not(k, "is", null);
  return qb;
}

function fail(table: string, error: { code?: string; message: string; details?: string }): never {
  if (error.code === "23505") {
    const col = /\((\w+)\)/.exec(error.details ?? "")?.[1] ?? "unknown";
    throw new DuplicateError(table, col);
  }
  throw new Error(`Database error on ${table}: ${error.message}`);
}

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.sb = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "x-application-name": "calm-1" } },
    });
  }

  async insert<K extends TableName>(table: K, row: Tables[K]) {
    const { data, error } = await this.sb.from(table).insert(row).select().single();
    if (error) fail(table, error);
    return data as Tables[K];
  }

  async get<K extends TableName>(table: K, id: string) {
    const { data, error } = await this.sb.from(table).select("*").eq("id", id).maybeSingle();
    if (error) fail(table, error);
    return (data as Tables[K]) ?? null;
  }

  async find<K extends TableName>(table: K, q?: Query<Tables[K]>) {
    const cols = q?.columns?.join(",") ?? "*";
    const out: Tables[K][] = [];
    let offset = q?.offset ?? 0;
    const wanted = q?.limit;
    // Page through PostgREST's row cap when no explicit limit is given.
    for (;;) {
      const take = wanted !== undefined ? Math.min(PAGE, wanted - out.length) : PAGE;
      if (take <= 0) break;
      let qb: Builder = this.sb.from(table).select(cols);
      qb = applyFilters(qb, q);
      if (q?.orderBy) qb = qb.order(q.orderBy, { ascending: !q.desc, nullsFirst: false });
      else qb = qb.order("id", { ascending: true });
      qb = qb.range(offset, offset + take - 1);
      const { data, error } = await qb;
      if (error) fail(table, error);
      const rows = (data ?? []) as Tables[K][];
      out.push(...rows);
      if (rows.length < take) break;
      offset += rows.length;
    }
    return out;
  }

  async findOne<K extends TableName>(table: K, q: Query<Tables[K]>) {
    const rows = await this.find(table, { ...q, limit: 1 });
    return rows[0] ?? null;
  }

  async count<K extends TableName>(table: K, q?: Query<Tables[K]>) {
    let qb: Builder = this.sb.from(table).select("id", { count: "exact", head: true });
    qb = applyFilters(qb, q);
    const { count, error } = await qb;
    if (error) fail(table, error);
    return count ?? 0;
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const { data, error } = await this.sb.from(table).update(patch as never).eq("id", id).select().maybeSingle();
    if (error) fail(table, error);
    return (data as Tables[K]) ?? null;
  }

  async updateWhere<K extends TableName>(table: K, where: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    let qb: Builder = this.sb.from(table).update(patch as never);
    qb = applyFilters(qb, { where });
    const { data, error } = await qb.select("id");
    if (error) fail(table, error);
    return (data ?? []).length;
  }

  async remove<K extends TableName>(table: K, id: string) {
    const { error } = await this.sb.from(table).delete().eq("id", id);
    if (error) fail(table, error);
  }

  async removeWhere<K extends TableName>(table: K, where: Partial<Tables[K]>) {
    if (!Object.keys(where).length) throw new Error("removeWhere requires a filter");
    let qb: Builder = this.sb.from(table).delete();
    qb = applyFilters(qb, { where });
    const { data, error } = await qb.select("id");
    if (error) fail(table, error);
    return (data ?? []).length;
  }

  async claimJobs(workerId: string, limit: number, now: string): Promise<JobRow[]> {
    const { data, error } = await this.sb.rpc("claim_jobs", { p_worker: workerId, p_limit: limit, p_now: now });
    if (error) fail("jobs", error);
    return (data ?? []) as JobRow[];
  }

  async ping() {
    const t = Date.now();
    const { error } = await this.sb.from("settings").select("id", { head: true, count: "exact" });
    return { ok: !error, latencyMs: Date.now() - t, error: error?.message };
  }
}
