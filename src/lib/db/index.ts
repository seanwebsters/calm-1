import path from "node:path";
import { env, requireEnv } from "../env";
import { LocalStore } from "./local";
import type { Store } from "./store";
import { SupabaseStore } from "./supabase";

export type { Store, Query } from "./store";
export { DuplicateError } from "./store";
export * from "./types";

const g = globalThis as unknown as { __calm1Store?: Store };

export function db(): Store {
  if (g.__calm1Store) return g.__calm1Store;
  const backend = env.dataBackend;
  if (backend === "supabase") {
    g.__calm1Store = new SupabaseStore(requireEnv(env.supabaseUrl, "SUPABASE_URL"), requireEnv(env.supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"));
  } else if (backend === "memory") {
    g.__calm1Store = new LocalStore();
  } else {
    if (env.isProduction && !process.env.ALLOW_LOCAL_STORE_IN_PRODUCTION) {
      throw new Error("Production requires Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    g.__calm1Store = new LocalStore({ file: path.join(env.dataDir, "calm-1.json") });
  }
  return g.__calm1Store;
}

/** Test helper: replace the store (e.g. with a fresh in-memory one). */
export function setStore(store: Store) {
  g.__calm1Store = store;
}
