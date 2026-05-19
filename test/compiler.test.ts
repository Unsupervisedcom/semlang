import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile, compileOntoql, parseOntoql } from "../src/index.js";

// Requirement coverage: type parsing, type validation, JSON Schema export,
// file/source forms, concept members, analytics/lenses, and read lowering.
// 01.01.001, 01.01.002, 01.01.003, 01.01.004, 01.01.005, 01.01.006, 01.01.007, 01.02.001
// 01.02.002, 01.02.003, 01.02.004, 01.02.005, 01.02.006, 01.02.007, 01.02.008, 01.02.009
// 01.02.010, 01.02.011, 01.02.012, 01.02.013, 01.03.001, 01.03.002
// 02.01.001, 02.01.002, 02.01.003, 02.01.004, 02.01.005, 02.01.006, 02.01.007, 02.01.008
// 02.01.009, 02.02.001, 02.02.002, 02.02.003, 02.02.004, 02.02.005, 02.02.006, 02.03.001
// 02.03.002, 02.03.003, 02.03.004, 02.03.005, 02.03.006, 02.03.007, 02.03.008, 02.03.009
// 02.04.001, 02.04.002, 02.04.003, 02.04.004, 02.04.005, 02.04.006
// 03.01.001, 03.01.002, 03.01.003, 03.01.004, 03.01.005, 03.01.006, 03.01.007, 03.01.008
// 03.01.009, 03.02.001, 03.02.002, 03.02.003, 03.02.004, 03.03.001, 03.03.002, 03.03.003
// 03.03.004, 03.03.005, 03.03.006, 03.04.001, 03.04.002, 03.04.003, 03.04.004, 03.04.005
// 03.04.006, 03.05.001, 03.05.002, 03.05.003, 03.05.004, 03.05.005, 03.05.006, 03.05.007
// 03.05.008, 03.05.009, 03.05.010, 03.05.011, 03.05.012, 03.06.001, 03.06.002, 03.06.003
// 03.06.004, 03.06.005, 03.06.006, 03.06.007, 03.06.008, 03.07.001, 03.07.002, 03.07.003
// 03.07.004, 03.07.005, 03.08.001, 03.08.002, 03.08.003, 03.08.004, 03.08.005, 03.08.006
// 03.09.001, 03.09.002, 03.09.003, 03.09.004, 03.09.005, 03.09.006, 03.09.007, 03.10.001
// 03.10.002, 03.10.003, 03.10.004
// 04.01.001, 04.01.002, 04.01.003, 04.01.004, 04.01.005, 04.01.006, 04.01.007, 04.02.001
// 04.02.002, 04.02.003, 04.02.004, 04.02.005, 04.02.006, 04.03.001, 04.03.002, 04.03.003
// 04.03.004, 04.03.005, 04.03.006, 04.03.007, 04.03.008, 04.03.009, 04.03.010, 04.03.011
// 04.03.012, 04.03.013, 04.03.014, 04.03.015, 04.03.016, 04.03.017, 04.04.001, 04.04.002
// 04.04.003, 04.04.004, 04.04.005, 04.04.006, 04.04.007, 04.04.008, 04.04.009, 04.04.010
// 04.04.011, 04.05.001, 04.05.002, 04.05.003, 04.05.004, 04.05.005, 04.05.006, 04.05.007
// 04.06.001, 04.06.002, 04.06.003, 04.06.004, 04.06.005, 04.06.006, 04.06.007, 04.06.008
// 04.06.009, 04.06.010, 04.06.011, 04.07.001, 04.07.002, 04.07.003, 04.07.004, 04.07.005
// 04.07.006, 04.07.007
// 05.03.001, 05.03.002, 05.03.003, 05.03.004, 05.03.005, 05.03.006, 05.03.007, 05.03.008
// 05.04.001, 05.04.002, 05.04.003, 05.04.004, 05.04.005, 05.05.001, 05.05.002, 05.05.003
// 05.05.004, 05.05.005, 05.05.006, 05.06.001, 05.06.002, 05.06.003

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
    expect(result.malloy).toContain("source: retail_line_items is duckdb.table('retail_line_items') extend");
    expect(result.malloy).toContain("join_one: product_at_sale is product_sku_history");
    expect(result.malloy).toContain("and sale.sold_at >= product_at_sale.valid_from");
    expect(result.malloy).toContain("on line_item_id = returns.original_line_item_id");
    expect(result.malloy).toContain("query: monthly_margin_and_returns is retail_line_items ->");
  });

  it("compiles lens queries through generated lens-local sources", async () => {
    const result = await compileFile(retailLens);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: retail_line_items__western_margin_intervention_queue is duckdb.table('retail_line_items') extend");
    expect(result.malloy).toContain("margin_risk_band is");
    expect(result.malloy).toContain("case when line_margin_rate < 0.10 then 'intervene'");
    expect(result.malloy).toContain("query: western_margin_intervention_queue is retail_line_items__western_margin_intervention_queue ->");
  });

  it("preserves explicit DuckDB table sources", async () => {
    const result = await compileFile(retailBase);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: stores is duckdb.table('stores') extend");
  });

  it("supports Malloy-like table, SQL, named source, and query source references", async () => {
    const result = await compileOntoql(`
package source.forms

type: Id is string {
}

source: sale_rows is duckdb.table('sales')

concept Sale is event from sale_rows {
  identity sale_id :: Id
  field:
    status :: string
    amount :: number
  measure:
    total_amount is sum(amount)
}

concept SqlSale is event from duckdb.sql("""
  select sale_id, status, amount from sales
""") {
  identity sale_id :: Id
  field:
    status :: string
    amount :: number
}

query: sales_by_status is Sale -> {
  group_by:
    status
  aggregate:
    total_amount
  calculate:
    status_rank is rank()
  order_by:
    total_amount desc
  limit: 10
}

query: sale_projection is Sale -> {
  select:
    sale_id
    sale_status is status
  order_by:
    sale_id
  top: 3
}

concept SaleStatus is situation from sales_by_status {
  identity status :: string
  field:
    total_amount :: number
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: sale_rows is duckdb.table('sales')");
    expect(result.malloy).toContain("source: sale is sale_rows extend");
    expect(result.malloy).toContain('source: sql_sale is duckdb.sql(""" select sale_id, status, amount from sales """) extend');
    expect(result.malloy).toContain("query: sales_by_status is sale ->");
    expect(result.malloy).toContain("calculate:\n    status_rank is rank()");
    expect(result.malloy).toContain("order_by:\n    total_amount desc");
    expect(result.malloy).toContain("limit: 10");
    expect(result.malloy).toContain("query: sale_projection is sale ->");
    expect(result.malloy).toContain("select:\n    sale_id\n    sale_status is status");
    expect(result.malloy).toContain("limit: 3");
    expect(result.malloy).toContain("source: sale_status is sales_by_status extend");
    expect(result.malloy!.indexOf("query: sales_by_status")).toBeLessThan(result.malloy!.indexOf("source: sale_status is sales_by_status extend"));
  });

  it("supports query/view compatibility clauses for having, project, nest, index, and view references", async () => {
    const result = await compileOntoql(`
package query.compat

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: string
  field:
    customer_id :: string
    status :: string
    amount :: number
  measure:
    total_amount is sum(amount)
  view: by_customer is {
    group_by:
      customer_id
    aggregate:
      total_amount
  }
}

query: customer_rollup is Sale -> by_customer

query: compatibility is Sale -> {
  project:
    sale_id
    sale_status is status
  aggregate:
    total_amount
    rows is count()
  having: total_amount > 100
  nest:
    by_customer
    customer_detail is by_customer
    status_detail is {
      group_by:
        status
      aggregate:
        rows is count()
      having: rows > 1
    }
  index:
    status
    customer is customer_id
  order_by:
    total_amount desc
  limit: 25
}
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.ast?.queries.find((query) => query.name === "compatibility")?.body.select).toHaveLength(2);
    expect(result.malloy).toContain("query: customer_rollup is sales -> by_customer");
    expect(result.malloy).toContain("query: compatibility is sales ->");
    expect(result.malloy).toContain("select:\n    sale_id\n    sale_status is status");
    expect(result.malloy).toContain("having: total_amount > 100");
    expect(result.malloy).toContain("nest:\n    by_customer\n    customer_detail is by_customer\n    status_detail is {");
    expect(result.malloy).toContain("having: rows > 1");
    expect(result.malloy).toContain("index:\n    status\n    customer is customer_id");
  });

  it("requires source methods to use named Malloy connections", () => {
    const result = parseOntoql(`
package bad.source

concept Sale is event from table('sales') {
  identity sale_id :: string
}
`);
    expect(result.ast).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: "UNQUALIFIED_SOURCE",
      location: { line: 4, column: 1 }
    });
    expect(result.diagnostics[0]?.message).toContain("duckdb.table('sales')");
  });

  it("supports Malloy join_cross and foreign-key with joins", async () => {
    const result = await compileOntoql(`
package malloy.joins

type: Id is string {
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: Id
  field:
    segment :: string
}

concept StoreDay is situation from duckdb.table('store_days') {
  identity store_day_id :: Id
  field:
    store_id :: Id
}

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: Id
  field:
    customer_id :: Id
    store_id :: Id
    amount :: number
  join_one customer: Customer with customer_id
  join_cross store_day: StoreDay
  join_cross comparable_store_day: StoreDay on store_id = comparable_store_day.store_id
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("join_one: customer is customers\n    with customer_id");
    expect(result.malloy).toContain("join_cross: store_day is store_days\n");
    expect(result.malloy).toContain("join_cross: comparable_store_day is store_days\n    on store_id = comparable_store_day.store_id");
  });

  it("validates richer Malloy filters, functions, and relation-aware aggregate methods", async () => {
    const result = await compileOntoql(`
package malloy.expressions

type: Id is string {
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: Id
  field:
    score :: number
}

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: Id
  field:
    customer_id :: Id
    status :: string
    email :: string
    order_date :: date
    amount :: number
  join_one customer: Customer with customer_id
}

query: filtered_sales is Sale -> {
  where:
    status ? 'new' | 'open',
    amount ~ 10 to 20,
    email !~ r'@example\\\\.com$',
    order_date ~ f'this week'
  group_by:
    status_label is upper(coalesce(status, 'unknown'))
  aggregate:
    rows is count()
    amount_stddev is stddev(amount)
    source_amount is sales.sum(amount)
    customer_rows is customer.count()
    average_customer_score is customer.score.avg()
    filtered_rows is count() { where: email ~ f'%.org' }
  calculate:
    previous_status is lag(status_label)
    running_rows is sum_cumulative(rows)
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("status ? 'new' | 'open'");
    expect(result.malloy).toContain("order_date ~ f'this week'");
    expect(result.malloy).toContain("source_amount is sales.sum(amount)");
    expect(result.malloy).toContain("average_customer_score is customer.score.avg()");
    expect(result.malloy).toContain("previous_status is lag(status_label)");
  });

  it("diagnoses invalid foreign-key with joins when identity metadata is available", async () => {
    const missingIdentity = await compileOntoql(`
package bad.join_with_identity

concept Customer is kind from duckdb.table('customers') {
  field:
    customer_id :: string
}

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: string
  field:
    customer_id :: string
  join_one customer: Customer with customer_id
}
`);
    expect(missingIdentity.diagnostics.map((diagnostic) => diagnostic.code)).toContain("JOIN_WITH_REQUIRES_IDENTITY");

    const missingForeignKey = await compileOntoql(`
package bad.join_with_fk

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
}

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: string
  join_one customer: Customer with customer_id
}
`);
    expect(missingForeignKey.diagnostics.map((diagnostic) => diagnostic.code)).toContain("UNKNOWN_PATH");
  });

  it("diagnoses semantic errors", async () => {
    const result = await compileOntoql(`
package bad.semantic

concept Sale is event from duckdb.table('sales') {
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

  it("01.02.001 exports semantic types and concepts as JSON Schema", async () => {
    const result = await compileOntoql(`
package schema.export

type: CustomerId is string {
  description: "Stable customer identifier."
  pattern: '^cus_[A-Za-z0-9]+$'
}

type: CustomerStatus is string {
  enum: ['active', 'paused', 'closed']
  scale_type: nominal
}

type: Dollars is currency {
  minimum: 0
  currency: "USD"
  render_format: currency("USD", 2)
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: CustomerId
  field:
    email :: string? unique
    status :: CustomerStatus
    lifetime_value :: Dollars
}
`);
    expect(result.diagnostics).toEqual([]);
    const schema = result.jsonSchema!;
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$vocabulary).toMatchObject({ "https://semlang.dev/vocab/ontoql/1": true });
    const defs = schema.$defs as Record<string, any>;
    expect(defs["type.CustomerStatus"]).toMatchObject({
      type: "string",
      enum: ["active", "paused", "closed"],
      "x-ontoql-scale-type": "nominal"
    });
    expect(defs["type.Dollars"]).toMatchObject({
      type: "number",
      minimum: 0,
      "x-ontoql-primitive": "currency",
      "x-ontoql-currency": "USD",
      "x-ontoql-render-format": "currency(\"USD\", 2)"
    });
    expect(defs["concept.Customer"]).toMatchObject({
      type: "object",
      required: ["customer_id", "email", "status", "lifetime_value"],
      "x-ontoql-stereotype": "kind",
      "x-ontoql-identity": ["customer_id"]
    });
    expect(defs["concept.Customer"].properties.customer_id).toMatchObject({
      $ref: "#/$defs/type.CustomerId",
      "x-ontoql-identity": true
    });
    expect(defs["concept.Customer"].properties.email).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
      "x-ontoql-unique": true
    });
  });

  it("01.01.005 diagnoses legacy and malformed type metadata", async () => {
    const result = await compileOntoql(`
package bad.type_metadata

type: Status is string {
  allowed_values: ['active']
}

type: BrokenEnum is string {
  enum: 'active'
}

concept A is kind from duckdb.table('a') {
  identity id :: string
}
`);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "LEGACY_TYPE_METADATA",
      "INVALID_TYPE_METADATA"
    ]));
  });

  it("diagnoses duplicate symbols, roles, lenses, temporal misuse, and include cycles", async () => {
    const duplicate = await compileOntoql(`
package bad.duplicates
type: Id is string {
}
type: Id is string {
}
concept A is kind from duckdb.table('a') {
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
concept A is kind from duckdb.table('a') {
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
concept A is kind from duckdb.table('a') {
  identity id :: Id
}
concept B is kind from duckdb.table('b') {
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
