/*
 * Purpose: Runs broad integration checks against example SemLang files through the public compileFile API.
 * Encapsulation: Keep filesystem-backed pipeline coverage here; lower-level phase tests belong in focused test files.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile } from "../src/index.js";

const root = path.resolve(import.meta.dirname, "..");

describe("Malloy/DuckDB integration", () => {
  it("generates connection-qualified Malloy suitable for runtime execution", async () => {
    const result = await compileFile(path.join(root, "examples/retail-omnichannel-margin-and-returns/example.semlang"));
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("duckdb.table('retail_line_items')");

    await import("@malloydata/malloy");
    await import("@malloydata/db-duckdb");

    // The compiler boundary is intentionally text-first. This assertion keeps
    // the runtime packages load-tested without depending on Malloy internals
    // that vary across releases.
    expect(result.malloy).toContain("query: monthly_margin_and_returns");
  });
});
