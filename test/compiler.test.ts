import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile, compileOntoql, parseOntoql } from "../src/index.js";

const root = path.resolve(import.meta.dirname, "..");
const retailBase = path.join(root, "examples/retail-omnichannel-margin-and-returns/example.ontoql");
const retailLens = path.join(root, "examples/retail-omnichannel-margin-and-returns/example_with_lens.ontoql");

describe("OntoQL parser", () => {
  it("parses the base retail fixture", async () => {
    const source = await fs.readFile(retailBase, "utf8");
    const result = parseOntoql(source, { filePath: retailBase });
    expect(result.diagnostics).toEqual([]);
    expect(result.ast?.packageName).toBe("retail.omnichannel_margin_returns");
    expect(result.ast?.types).toHaveLength(22);
    expect(result.ast?.concepts.map((concept) => concept.name)).toEqual([
      "Store",
      "Customer",
      "LoyaltyPointBalance",
      "ProductSKU",
      "ProductSKUVersion",
      "Promotion",
      "PromotionAllocation",
      "ReturnLine",
      "Sale",
      "SaleLine",
      "InventoryPosition"
    ]);
    expect(result.ast?.queries.map((query) => query.name)).toContain("monthly_margin_and_returns");
  });

  it("reports line and column parse diagnostics", () => {
    const result = parseOntoql("package bad\nconcept Nope kind\n");
    expect(result.ast).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: "INVALID_CONCEPT_DECL",
      location: { line: 2, column: 1 }
    });
  });
});

describe("OntoQL compiler", () => {
  it("compiles base retail OntoQL to Malloy", async () => {
    const result = await compileFile(retailBase);
    expect(result.diagnostics).toEqual([]);
    expect(result.model?.concepts.size).toBe(11);
    expect(result.malloy).toContain("source: retail_line_items is table('retail_line_items') extend");
    expect(result.malloy).toContain("join_one: product_at_sale is product_sku_history");
    expect(result.malloy).toContain("and sale.sold_at >= product_at_sale.valid_from");
    expect(result.malloy).toContain("on line_item_id = returns.original_line_item_id");
    expect(result.malloy).toContain("query: monthly_margin_and_returns is retail_line_items ->");
  });

  it("compiles lens queries through generated lens-local sources", async () => {
    const result = await compileFile(retailLens);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: retail_line_items__western_margin_intervention_queue is table('retail_line_items') extend");
    expect(result.malloy).toContain("margin_risk_band is");
    expect(result.malloy).toContain("case when line_margin_rate < 0.10 then 'intervene'");
    expect(result.malloy).toContain("query: western_margin_intervention_queue is retail_line_items__western_margin_intervention_queue ->");
  });

  it("supports DuckDB source mode", async () => {
    const result = await compileFile(retailBase, { sourceMode: "duckdb" });
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: stores is duckdb.table('stores') extend");
  });

  it("diagnoses semantic errors", async () => {
    const result = await compileOntoql(`
package bad.semantic

concept Sale is event from table('sales') {
  identity sale_id :: MissingType
  join_one customer: Customer on customer_id
  measure:
    broken is sum(nope.value)
}

query: q is Sale -> {
  aggregate:
    raw_customer is sale_id
}
`);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "UNKNOWN_TYPE",
      "UNKNOWN_JOIN_TARGET",
      "UNKNOWN_PATH",
      "RAW_FIELD_IN_AGGREGATE_ALIAS"
    ]));
  });

  it("diagnoses duplicate symbols, roles, lenses, temporal misuse, and include cycles", async () => {
    const duplicate = await compileOntoql(`
package bad.duplicates
type: Id is string {
}
type: Id is string {
}
concept A is kind from table('a') {
  identity id :: Id
  field:
    id :: Id
}
lens: l is {
  refine: Missing extend {
    where: id is MissingRole
  }
}
query: q is A with missing_lens -> {
  where: id is MissingRole
  aggregate:
    rows is count()
}
`);
    expect(duplicate.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_TYPE",
      "DUPLICATE_FIELD",
      "UNKNOWN_REFINEMENT_TARGET",
      "UNKNOWN_LENS"
    ]));

    const unknownRole = await compileOntoql(`
package bad.role
type: Id is string {
}
concept A is kind from table('a') {
  identity id :: Id
}
query: q is A -> {
  where: id is MissingRole
  aggregate:
    rows is count()
}
`);
    expect(unknownRole.diagnostics.map((diagnostic) => diagnostic.code)).toContain("UNKNOWN_ROLE");

    const temporal = await compileOntoql(`
package bad.temporal
type: Id is string {
}
concept A is kind from table('a') {
  identity id :: Id
}
concept B is kind from table('b') {
  identity id :: Id
  join_one a: A on id at id
}
`);
    expect(temporal.diagnostics.map((diagnostic) => diagnostic.code)).toContain("INVALID_TEMPORAL_JOIN");

    const parsed = parseOntoql(`package cycle\ninclude "./self.ontoql"\n`, { filePath: "/tmp/self.ontoql" });
    expect(parsed.ast).toBeDefined();
    const cycle = parsed.ast
      ? await compileOntoql(`package cycle\ninclude "./self.ontoql"\n`, {
          filePath: "/tmp/self.ontoql",
          packageLoader: {
            load() {
              return { filePath: "/tmp/self.ontoql", source: `package cycle\ninclude "./self.ontoql"\n` };
            }
          }
        })
      : undefined;
    expect(cycle?.diagnostics.map((diagnostic) => diagnostic.code)).toContain("INCLUDE_CYCLE");
  });
});
