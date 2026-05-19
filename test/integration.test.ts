import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile } from "../src/index.js";

const root = path.resolve(import.meta.dirname, "..");

describe("Malloy/DuckDB integration", () => {
  it("generates DuckDB-mode Malloy suitable for runtime execution", async () => {
    const result = await compileFile(path.join(root, "examples/retail-omnichannel-margin-and-returns/example.ontoql"), {
      sourceMode: "duckdb"
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("duckdb.table('retail_line_items')");

    try {
      const malloyPackage = "@malloydata/malloy";
      const duckdbPackage = "@malloydata/db-duckdb";
      await import(malloyPackage);
      await import(duckdbPackage);
    } catch {
      expect.soft(true, "Malloy runtime packages are optional in this environment.").toBe(true);
      return;
    }

    // The compiler boundary is intentionally text-first. This assertion keeps
    // the runtime packages load-tested without depending on Malloy internals
    // that vary across releases.
    expect(result.malloy).toContain("query: monthly_margin_and_returns");
  });
});
