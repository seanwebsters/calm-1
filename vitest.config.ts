import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    pool: "forks",
    env: {
      NODE_ENV: "test",
      DATA_BACKEND: "memory",
      AUTH_PROVIDER: "local",
      ADMIN_PASSCODE: "test-passcode",
      SESSION_SECRET: "test-session-secret-test-session-secret",
      DATA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      PHONE_HASH_PEPPER: "test-pepper",
      ANTHROPIC_API_KEY: "",
      WHATSAPP_ACCESS_TOKEN: "",
      WHATSAPP_APP_SECRET: "test-app-secret",
      WHATSAPP_VERIFY_TOKEN: "test-verify-token",
      WHATSAPP_PHONE_NUMBER_ID: "",
      UPSTASH_REDIS_REST_URL: "",
    },
  },
});
