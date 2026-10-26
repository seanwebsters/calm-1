/**
 * Typed access to environment configuration. Secrets are only ever read on
 * the server – nothing here is exposed with a NEXT_PUBLIC_ prefix.
 */
import path from "node:path";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export const env = {
  get nodeEnv() {
    return str("NODE_ENV", "development");
  },
  get isProduction() {
    return str("NODE_ENV") === "production";
  },
  get isTest() {
    return str("NODE_ENV") === "test" || !!process.env.VITEST;
  },
  /** "supabase" in production, "local" (JSON file) for development, "memory" in tests. */
  get dataBackend(): "supabase" | "local" | "memory" {
    const v = str("DATA_BACKEND");
    if (v === "supabase" || v === "local" || v === "memory") return v;
    return str("SUPABASE_URL") && str("SUPABASE_SERVICE_ROLE_KEY") ? "supabase" : "local";
  },
  get dataDir() {
    // Serverless hosts only allow writes under /tmp.
    return str("DATA_DIR", process.env.VERCEL ? "/tmp/calm-1" : path.join(process.cwd(), ".data"));
  },
  /** Production without Supabase: data lives in temporary storage and is lost on restart. */
  get temporaryStorage() {
    return this.isProduction && this.dataBackend !== "supabase";
  },
  /** No passcode or Supabase Auth: anyone with the link can open the dashboard. */
  get openAccess() {
    return this.authProvider === "local" && !this.adminPasscode;
  },
  get supabaseUrl() {
    return str("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return str("SUPABASE_SERVICE_ROLE_KEY");
  },
  get supabaseAnonKey() {
    return str("SUPABASE_ANON_KEY");
  },
  /** "supabase" uses Supabase Auth (email magic link / password); "local" uses ADMIN_PASSCODE. */
  get authProvider(): "supabase" | "local" {
    return str("AUTH_PROVIDER") === "supabase" ? "supabase" : "local";
  },
  get adminPasscode() {
    return str("ADMIN_PASSCODE");
  },
  get sessionSecret() {
    return str("SESSION_SECRET");
  },
  get encryptionKey() {
    return str("DATA_ENCRYPTION_KEY");
  },
  get phoneHashPepper() {
    return str("PHONE_HASH_PEPPER");
  },
  get anthropicApiKey() {
    return str("ANTHROPIC_API_KEY");
  },
  get whatsappAccessToken() {
    return str("WHATSAPP_ACCESS_TOKEN");
  },
  get whatsappPhoneNumberId() {
    return str("WHATSAPP_PHONE_NUMBER_ID");
  },
  get whatsappBusinessAccountId() {
    return str("WHATSAPP_BUSINESS_ACCOUNT_ID");
  },
  get whatsappAppSecret() {
    return str("WHATSAPP_APP_SECRET");
  },
  get whatsappVerifyToken() {
    return str("WHATSAPP_VERIFY_TOKEN");
  },
  get whatsappGraphVersion() {
    return str("WHATSAPP_GRAPH_VERSION", "v23.0");
  },
  get elevenLabsApiKey() {
    return str("ELEVENLABS_API_KEY");
  },
  get upstashUrl() {
    return str("UPSTASH_REDIS_REST_URL");
  },
  get upstashToken() {
    return str("UPSTASH_REDIS_REST_TOKEN");
  },
  get cronSecret() {
    return str("CRON_SECRET");
  },
  get appUrl() {
    return str("APP_URL", "http://localhost:3000");
  },
  /** Run the job worker inside the web process (default for local development). */
  get inProcessWorker() {
    const v = str("IN_PROCESS_WORKER");
    if (v) return v === "1" || v === "true";
    return !this.isProduction && !this.isTest;
  },
  get deployment() {
    return {
      commit: str("VERCEL_GIT_COMMIT_SHA") || str("GIT_COMMIT") || "local",
      environment: str("VERCEL_ENV") || this.nodeEnv,
      region: str("VERCEL_REGION") || "local",
    };
  },
};

export function requireEnv(value: string, name: string): string {
  if (!value) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return value;
}
