/*
 * Purpose: Provides test-only DuckDB configuration derived from environment flags.
 * Encapsulation: Keep test runtime configuration here; production MCP settings must flow through SEMLANG_* handling.
 */

const duckDbExternalAccessEnv = "SEMLANG_TEST_DUCKDB_ENABLE_EXTERNAL_ACCESS";

export function testDuckDbExternalAccessConfig(): { enableExternalAccess?: boolean } {
  const raw = process.env[duckDbExternalAccessEnv];
  if (raw === undefined || raw === "") return {};
  return { enableExternalAccess: parseBooleanEnv(raw, duckDbExternalAccessEnv) };
}

function parseBooleanEnv(value: string, name: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`${name} must be true or false, got ${JSON.stringify(value)}.`);
}
