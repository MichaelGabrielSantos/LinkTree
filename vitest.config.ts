import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src"), "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgres://contexto:contexto@localhost:5432/contexto_test",
      AI_PROVIDER: "none",
      CONNECTOR_RETRIES: "0",
      AI_DAILY_CALL_LIMIT: "1000",
    },
  },
});
