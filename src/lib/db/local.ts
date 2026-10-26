/**
 * In-process store for local development (persisted to a JSON file in
 * DATA_DIR) and tests (memory only). Single-process: run the job worker
 * in-process when using it (the default in development).
 */
import fs from "node:fs";
import path from "node:path";
import type { JobRow, TableName, Tables } from "./types";
import { DuplicateError, UNIQUE, applyOrderAndPage, matches, type Query, type Store } from "./store";

type Data = { [K in TableName]?: Tables[K][] };

const clone = <T>(v: T): T => structuredClone(v);

export class LocalStore implements Store {
  readonly kind: "local" | "memory";
  private data: Data = {};
  private file: string | null;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(opts: { file?: string | null } = {}) {
    this.file = opts.file ?? null;
    this.kind = this.file ? "local" : "memory";
    if (this.file && fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8")) as Data;
    }
  }

  private rows<K extends TableName>(table: K): Tables[K][] {
    const d = this.data as Record<string, unknown[]>;
    return (d[table] ??= []) as Tables[K][];
  }

  private persist() {
    if (!this.file) return;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 50);
  }

  flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  reset() {
    this.data = {};
    this.persist();
  }

  async insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]> {
    const rows = this.rows(table);
    for (const col of (UNIQUE[table] ?? []) as string[]) {
      const v = (row as unknown as Record<string, unknown>)[col];
      if (v !== null && v !== undefined && rows.some((r) => (r as unknown as Record<string, unknown>)[col] === v)) throw new DuplicateError(table, col);
    }
    rows.push(clone(row));
    this.persist();
    return clone(row);
  }

  async get<K extends TableName>(table: K, id: string) {
    const r = this.rows(table).find((x) => (x as { id: string }).id === id);
    return r ? clone(r) : null;
  }

  async find<K extends TableName>(table: K, q?: Query<Tables[K]>) {
    return clone(applyOrderAndPage(this.rows(table).filter((r) => matches(r, q)), q));
  }

  async findOne<K extends TableName>(table: K, q: Query<Tables[K]>) {
    const rows = await this.find(table, { ...q, limit: 1 });
    return rows[0] ?? null;
  }

  async count<K extends TableName>(table: K, q?: Query<Tables[K]>) {
    return this.rows(table).filter((r) => matches(r, q)).length;
  }

  async update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>) {
    const r = this.rows(table).find((x) => (x as { id: string }).id === id);
    if (!r) return null;
    Object.assign(r, clone(patch));
    this.persist();
    return clone(r);
  }

  async updateWhere<K extends TableName>(table: K, where: Partial<Tables[K]>, patch: Partial<Tables[K]>) {
    let n = 0;
    for (const r of this.rows(table)) {
      if (matches(r, { where })) {
        Object.assign(r, clone(patch));
        n++;
      }
    }
    if (n) this.persist();
    return n;
  }

  async remove<K extends TableName>(table: K, id: string) {
    const rows = this.rows(table);
    const i = rows.findIndex((x) => (x as { id: string }).id === id);
    if (i >= 0) rows.splice(i, 1);
    this.persist();
  }

  async removeWhere<K extends TableName>(table: K, where: Partial<Tables[K]>) {
    const rows = this.rows(table);
    const keep = rows.filter((r) => !matches(r, { where }));
    const n = rows.length - keep.length;
    (this.data as Record<string, unknown>)[table] = keep;
    if (n) this.persist();
    return n;
  }

  async claimJobs(workerId: string, limit: number, now: string): Promise<JobRow[]> {
    const jobs = this.rows("jobs");
    const busy = new Set(jobs.filter((j) => j.status === "running" && j.lock_key).map((j) => j.lock_key));
    // The head of each lock key is its oldest queued job; later jobs wait behind it
    // even while it backs off, so a user's messages are always answered in order.
    const heads = new Map<string, JobRow>();
    for (const j of jobs) {
      if (j.status !== "queued" || !j.lock_key) continue;
      const h = heads.get(j.lock_key);
      if (!h || j.created_at < h.created_at) heads.set(j.lock_key, j);
    }
    const due = jobs
      .filter((j) => j.status === "queued" && j.run_at <= now)
      .filter((j) => !j.lock_key || (heads.get(j.lock_key) === j && !busy.has(j.lock_key)))
      .sort((a, b) => (a.run_at === b.run_at ? a.created_at.localeCompare(b.created_at) : a.run_at.localeCompare(b.run_at)))
      .slice(0, limit);
    for (const j of due) {
      j.status = "running";
      j.locked_by = workerId;
      j.locked_at = now;
      j.attempts += 1;
      j.updated_at = now;
    }
    if (due.length) this.persist();
    return due.map(clone);
  }

  async ping() {
    return { ok: true, latencyMs: 0 };
  }
}
