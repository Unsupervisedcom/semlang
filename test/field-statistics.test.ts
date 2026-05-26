/*
 * Purpose: Covers compiler-facing field statistics metadata behavior.
 * Encapsulation: Keep indexed member syntax and metadata assertions here; MCP runtime statistics coverage belongs in test/mcp/execution.test.ts.
 */

import { describe, expect, it } from "vitest";
import { compileSemLang } from "../src/index.js";

describe("SemLang field statistics metadata", () => {
  it("parses indexed field, dimension, and measure modifiers without changing Malloy emission", async () => {
    // 08.01.001, 08.01.002, 08.01.003, 08.01.004, 08.01.005:
    // indexed is SemLang metadata on fields, dimensions, and measures, not a
    // Malloy emission modifier.
    const result = await compileSemLang(`
package indexed.members

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  field:
    status :: string indexed
    note :: string writeable indexed

  dimension:
    status_label is status indexed
    writeable_status is status writeable indexed {
      write: column status = {value}
    }

  measure:
    customer_count is count() indexed
}
`);

    expect(result.diagnostics).toEqual([]);
    const concept = result.model?.concepts.get("Customer");
    expect(concept?.fields.find((field) => field.name === "status")).toMatchObject({ indexed: true });
    expect(concept?.fields.find((field) => field.name === "note")).toMatchObject({
      indexed: true,
      writeable: true,
    });
    expect(concept?.dimensions.find((dimension) => dimension.name === "status_label")).toMatchObject({
      indexed: true,
    });
    expect(concept?.dimensions.find((dimension) => dimension.name === "writeable_status")).toMatchObject({
      indexed: true,
      writeable: true,
    });
    expect(concept?.measures.find((measure) => measure.name === "customer_count")).toMatchObject({ indexed: true });
    expect(result.malloy).not.toContain("indexed");
    const defs = result.jsonSchema?.$defs as Record<string, unknown> | undefined;
    expect(defs?.["concept.Customer"]).toMatchObject({
      properties: {
        status: { "x-semlang-indexed": true },
      },
      "x-semlang-dimensions": expect.arrayContaining([
        expect.objectContaining({ name: "status_label", indexed: true }),
      ]),
      "x-semlang-measures": expect.arrayContaining([
        expect.objectContaining({ name: "customer_count", indexed: true }),
      ]),
    });
  });
});
