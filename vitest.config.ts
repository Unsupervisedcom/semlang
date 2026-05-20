import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: {
      SEMLANG_TEST_DUCKDB_ENABLE_EXTERNAL_ACCESS: process.env.SEMLANG_TEST_DUCKDB_ENABLE_EXTERNAL_ACCESS ?? "false",
    },
    globals: false,
    testTimeout: 30000,
  },
});
