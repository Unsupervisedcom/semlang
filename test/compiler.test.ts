import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile, compileSemLang, parseSemLang } from "../src/index.js";

type JsonSchemaObject = Record<string, unknown> & {
  properties?: Record<string, unknown>;
};

// Requirement coverage: type parsing, type validation, JSON Schema export,
// file/source forms, concept members, analytics/lenses, and read lowering.
// 01.01.001, 01.01.002, 01.01.003, 01.01.004, 01.01.005, 01.01.006, 01.01.007, 01.01.008
// 01.02.001
// 01.02.002, 01.02.003, 01.02.004, 01.02.005, 01.02.006, 01.02.007, 01.02.008, 01.02.009
// 01.02.010, 01.02.011, 01.02.012, 01.02.013, 01.02.014, 01.03.001, 01.03.002
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
// 03.08.007, 03.08.008, 03.08.009, 03.08.010, 03.08.011, 03.09.001, 03.09.002, 03.09.003
// 03.09.004, 03.09.005, 03.09.006, 03.09.007, 03.10.001
// 03.10.002, 03.10.003, 03.10.004
// 04.01.001, 04.01.002, 04.01.003, 04.01.004, 04.01.005, 04.01.006, 04.01.007, 04.02.001
// 04.02.002, 04.02.003, 04.02.004, 04.02.005, 04.02.006, 04.03.001, 04.03.002, 04.03.003
// 04.03.004, 04.03.005, 04.03.006, 04.03.007, 04.03.008, 04.03.009, 04.03.010, 04.03.011
// 04.03.012, 04.03.013, 04.03.014, 04.03.015, 04.03.016, 04.03.017, 04.04.001, 04.04.002
// 04.04.003, 04.04.004, 04.04.005, 04.04.006, 04.04.007, 04.04.008, 04.04.009, 04.04.010
// 04.04.011, 04.05.001, 04.05.002, 04.05.003, 04.05.004, 04.05.005, 04.05.006, 04.05.007
// 04.06.001, 04.06.002, 04.06.003, 04.06.004, 04.06.005, 04.06.006, 04.06.007, 04.06.008
// 04.06.009, 04.06.010, 04.06.011, 04.06.012, 04.06.013, 04.07.001, 04.07.002, 04.07.003
// 04.07.004, 04.07.005, 04.07.006, 04.07.007, 04.07.008
// 05.03.001, 05.03.002, 05.03.003, 05.03.004, 05.03.005, 05.03.006, 05.03.007, 05.03.008
// 05.04.001, 05.04.002, 05.04.003, 05.04.004, 05.04.005, 05.05.001, 05.05.002, 05.05.003
// 05.05.004, 05.05.005, 05.05.006, 05.06.001, 05.06.002, 05.06.003

const root = path.resolve(import.meta.dirname, "..");
const retailBase = path.join(root, "examples/retail-omnichannel-margin-and-returns/example.semlang");
const retailLens = path.join(root, "examples/retail-omnichannel-margin-and-returns/example_with_lens.semlang");

describe("SemLang parser", () => {
  it("parses the base retail fixture", async () => {
    const source = await fs.readFile(retailBase, "utf8");
    const result = parseSemLang(source, { filePath: retailBase });
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
      "Sale",
      "SaleLine",
      "ReturnLine",
      "InventoryPosition",
    ]);
    expect(result.ast?.queries.map((query) => query.name)).toContain("monthly_margin_and_returns");
  });

  it("reports line and column parse diagnostics", () => {
    const result = parseSemLang("package bad\nconcept Nope kind\n");
    expect(result.ast).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: "INVALID_CONCEPT_DECL",
      location: { line: 2, column: 1 },
    });
  });
});

describe("SemLang compiler", () => {
  it("compiles base retail SemLang to Malloy", async () => {
    const result = await compileFile(retailBase);
    expect(result.diagnostics).toEqual([]);
    expect(result.model?.concepts.size).toBe(11);
    expect(result.malloy).toContain("source: retail_line_items is __semlang_base_retail_line_items extend");
    expect(result.malloy).toContain("join_one: product_at_sale is product_sku_history");
    expect(result.malloy).toContain("and cast(sale.sold_at as date) >= product_at_sale.valid_from");
    expect(result.malloy).toContain("on line_item_id = returns.original_line_item_id");
    expect(result.malloy).toContain("query: monthly_margin_and_returns is retail_line_items ->");
  });

  it("compiles lens queries through generated lens-local sources", async () => {
    const result = await compileFile(retailLens);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain(
      "source: retail_line_items__western_margin_intervention_queue is __semlang_base_retail_line_items__western_margin_intervention_queue extend",
    );
    expect(result.malloy).toContain("margin_risk_band is");
    expect(result.malloy).toContain('pick "intervene" when line_margin_rate < 0.10');
    expect(result.malloy).toContain(
      "query: western_margin_intervention_queue is retail_line_items__western_margin_intervention_queue ->",
    );
  });

  it("applies deep lens filters to joined grains before aggregating on the query root", async () => {
    const result = await compileSemLang(`
package lens.deep_filters

concept ProductSKU is kind from duckdb.table('products') {
  identity product_id :: string
  field:
    brand :: string
}

concept SaleLine is event from duckdb.table('sale_lines') {
  identity line_id :: string
  field:
    customer_id :: string
    product_id :: string
    sold_at :: timestamp
    net_sales_amount :: number
  occurrence_time: sold_at
  join_one product: ProductSKU on product_id
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  field:
    age :: number
  join_many sale_lines: SaleLine on customer_id
  measure:
    apple_product_spend is sale_lines.sum(net_sales_amount)
}

lens: apple_products is {
  refine: ProductSKU extend {
    where: brand = 'Apple'
  }

  refine: SaleLine extend {
    where: product.brand = 'Apple'
  }
}

lens: young_adult_customers is {
  refine: Customer extend {
    where: age >= 18 and age <= 25
  }
}

query: young_adult_apple_value is Customer with apple_products, young_adult_customers -> {
  group_by:
    customer_id
  aggregate:
    apple_product_spend
}
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.model?.concepts.get("Customer")?.where).toHaveLength(0);
    expect(result.malloy).toContain(
      "source: sale_lines__young_adult_apple_value is __semlang_base_sale_lines__young_adult_apple_value extend",
    );
    expect(result.malloy).toContain("join_one: product is products__young_adult_apple_value");
    expect(result.malloy).toContain("where: product.brand = 'Apple'");
    expect(result.malloy).toContain(
      "source: products__young_adult_apple_value is __semlang_base_products__young_adult_apple_value extend",
    );
    expect(result.malloy).toContain("where: brand = 'Apple'");
    expect(result.malloy).toContain(
      "source: customers__young_adult_apple_value is __semlang_base_customers__young_adult_apple_value extend",
    );
    expect(result.malloy).toContain("join_many: sale_lines is sale_lines__young_adult_apple_value");
    expect(result.malloy).toContain("where: age >= 18 and age <= 25");
    expect(result.malloy).toContain("apple_product_spend is sale_lines.sum(net_sales_amount)");
    expect(result.malloy).toContain("query: young_adult_apple_value is customers__young_adult_apple_value ->");
    expect(result.malloy).toContain("aggregate:\n    apple_product_spend");
  });

  it("preserves explicit DuckDB table sources", async () => {
    const result = await compileFile(retailBase);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: stores is __semlang_base_stores extend");
  });

  it("supports Malloy-like table, SQL, named source, and query source references", async () => {
    const result = await compileSemLang(`
package source.forms

type: Id is string {
}

source: sale_rows is duckdb.table('sales')

concept Sale is event from sale_rows {
  identity sale_id :: Id
  field:
    status :: string
    sold_at :: timestamp
    amount :: number
  occurrence_time: sold_at
  measure:
    total_amount is sum(amount)
}

concept SqlSale is event from duckdb.sql("""
  select sale_id, status, sold_at, amount from sales
""") {
  identity sale_id :: Id
  field:
    status :: string
    sold_at :: timestamp
    amount :: number
  occurrence_time: sold_at
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
  observation_time: status
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: sale_rows is duckdb.table('sales')");
    expect(result.malloy).toContain("source: sale is __semlang_base_sale extend");
    expect(result.malloy).toContain("source: sql_sale is __semlang_base_sql_sale extend");
    expect(result.malloy).toContain("query: sales_by_status is sale ->");
    expect(result.malloy).toContain("calculate:\n    status_rank is rank()");
    expect(result.malloy).toContain("order_by:\n    total_amount desc");
    expect(result.malloy).toContain("limit: 10");
    expect(result.malloy).toContain("query: sale_projection is sale ->");
    expect(result.malloy).toContain("select:\n    sale_id\n    sale_status is status");
    expect(result.malloy).toContain("limit: 3");
    expect(result.malloy).toContain("source: sale_status is sales_by_status extend");
    expect(result.malloy!.indexOf("query: sales_by_status")).toBeLessThan(
      result.malloy!.indexOf("source: sale_status is sales_by_status extend"),
    );
  });

  it("preserves ignored sources as metadata without emitting Malloy", async () => {
    const result = await compileSemLang(`
package ignored.sources

ignored duckdb.table('staging_customer_raw') {
  reason: "Staging table; canonical data lives in dim_customer"
}

concept Customer is kind from duckdb.table('dim_customer') {
  identity customer_id :: string
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast?.ignored).toHaveLength(1);
    expect(result.model?.ignored).toHaveLength(1);
    expect(result.model?.ignored[0]).toMatchObject({
      reason: '"Staging table; canonical data lives in dim_customer"',
      source: {
        kind: "table",
        connection: "duckdb",
        path: "staging_customer_raw",
        expression: "duckdb.table('staging_customer_raw')",
      },
    });
    expect(result.malloy).not.toContain("staging_customer_raw");
    expect(result.jsonSchema?.["x-semlang-ignored-sources"]).toEqual([
      {
        source: "duckdb.table('staging_customer_raw')",
        sourceKind: "table",
        reason: "Staging table; canonical data lives in dim_customer",
        metadata: {
          reason: "Staging table; canonical data lives in dim_customer",
        },
      },
    ]);
    expect(result.malloy).toContain("source: dim_customer is __semlang_base_dim_customer extend");
  });

  it("diagnoses ignored sources without reasons, duplicates, and modeled sources", async () => {
    const result = await compileSemLang(`
package ignored.invalid

ignored duckdb.table('customers') {
}

ignored duckdb.table('customers') {
  reason: "duplicate"
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
}
`);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["MISSING_IGNORED_REASON", "DUPLICATE_IGNORED_SOURCE", "IGNORED_SOURCE_MODELED"]),
    );
  });

  it("supports query/view compatibility clauses for having, project, nest, index, and view references", async () => {
    const result = await compileSemLang(`
package query.compat

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: string
  field:
    customer_id :: string
    status :: string
    sold_at :: timestamp
    amount :: number
  occurrence_time: sold_at
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
    expect(result.malloy).toContain(
      "nest:\n    by_customer\n    customer_detail is by_customer\n    status_detail is {",
    );
    expect(result.malloy).toContain("having: rows > 1");
    expect(result.malloy).toContain("index:\n    status\n    customer is customer_id");
  });

  it("requires source methods to use named Malloy connections", () => {
    const result = parseSemLang(`
package bad.source

concept Sale is event from table('sales') {
  identity sale_id :: string
}
`);
    expect(result.ast).toBeUndefined();
    expect(result.diagnostics[0]).toMatchObject({
      code: "UNQUALIFIED_SOURCE",
      location: { line: 4, column: 1 },
    });
    expect(result.diagnostics[0]?.message).toContain("duckdb.table('sales')");
  });

  it("supports Malloy join_cross and foreign-key with joins", async () => {
    const result = await compileSemLang(`
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
    business_date :: date
  observation_time: business_date
}

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: Id
  field:
    customer_id :: Id
    store_id :: Id
    sold_at :: timestamp
    amount :: number
  occurrence_time: sold_at
  join_one customer: Customer with customer_id
  join_cross store_day: StoreDay
  join_cross comparable_store_day: StoreDay on store_id = comparable_store_day.store_id
}
`);
    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("join_one: customer is customers\n    with customer_id");
    expect(result.malloy).toContain("join_cross: store_day is store_days\n");
    expect(result.malloy).toContain(
      "join_cross: comparable_store_day is store_days\n    on store_id = comparable_store_day.store_id",
    );
  });

  it("validates richer Malloy filters, functions, and relation-aware aggregate methods", async () => {
    const result = await compileSemLang(`
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
  occurrence_time: order_date
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
    const missingIdentity = await compileSemLang(`
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

    const missingForeignKey = await compileSemLang(`
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
    const result = await compileSemLang(`
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
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["UNKNOWN_TYPE", "UNKNOWN_JOIN_TARGET", "UNKNOWN_PATH", "RAW_FIELD_IN_AGGREGATE_ALIAS"]),
    );
  });

  it("01.02.001 exports semantic types and concepts as JSON Schema", async () => {
    const result = await compileSemLang(`
package schema.export

type: CustomerId is string {
  description: "Stable customer identifier."
  pattern: '^cus_[A-Za-z0-9]+$'
}

type: CustomerStatus is string {
  enum: "active", "paused", "closed"
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
    expect(schema.$vocabulary).toMatchObject({ "https://semlang.dev/vocab/semlang/1": true });
    const defs = schema.$defs as Record<string, JsonSchemaObject>;
    expect(defs["type.CustomerStatus"]).toMatchObject({
      type: "string",
      enum: ["active", "paused", "closed"],
      "x-semlang-scale-type": "nominal",
    });
    expect(defs["type.Dollars"]).toMatchObject({
      type: "number",
      minimum: 0,
      "x-semlang-primitive": "currency",
      "x-semlang-currency": "USD",
      "x-semlang-render-format": 'currency("USD", 2)',
    });
    expect(defs["concept.Customer"]).toMatchObject({
      type: "object",
      required: ["customer_id", "email", "status", "lifetime_value"],
      "x-semlang-stereotype": "kind",
      "x-semlang-identity": ["customer_id"],
    });
    const customerSchema = defs["concept.Customer"]!;
    const customerProperties = customerSchema.properties!;
    expect(customerProperties.customer_id).toMatchObject({
      $ref: "#/$defs/type.CustomerId",
      "x-semlang-identity": true,
    });
    expect(customerProperties.email).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
      "x-semlang-unique": true,
    });
  });

  it("03.08.007 supports qualified role names plus role labels and alias metadata", async () => {
    const result = await compileSemLang(`
package roles.qualified

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  field:
    status :: string
  role Active when status = 'active' {
    label: "Active Customer"
    aliases: "Current Customer", "Open Customer"
  }
}

concept Account is kind from duckdb.table('accounts') {
  identity account_id :: string
  field:
    customer_id :: string
    status :: string
  join_one customer: Customer on customer_id
  role Active when status = 'open'
}

query: active_customers is Account -> {
  where: customer is Customer.Active
  select:
    account_id
}
`);
    expect(result.diagnostics).toEqual([]);
    const customerRole = result.model?.concepts.get("Customer")?.roles[0];
    expect(customerRole).toMatchObject({
      name: "Active",
      label: "Active Customer",
      aliases: ["Current Customer", "Open Customer"],
    });
    expect(result.malloy).toContain("is_active is status = 'active'");
    expect(result.malloy).toContain("where: (customer.status = 'active')");

    const defs = result.jsonSchema?.$defs as Record<string, JsonSchemaObject>;
    const roles = defs["concept.Customer"]!["x-semlang-roles"] as unknown[];
    expect(roles[0]).toMatchObject({
      name: "Active",
      qualifiedName: "Customer.Active",
      label: "Active Customer",
      aliases: ["Current Customer", "Open Customer"],
      predicate: "status = 'active'",
    });
  });

  it("01.01.005 diagnoses legacy and malformed type metadata", async () => {
    const result = await compileSemLang(`
package bad.type_metadata

type: Status is string {
  allowed_values: ['active']
}

type: BrokenEnum is string {
  enum: { value: 'active' }
}

concept A is kind from duckdb.table('a') {
  identity id :: string
}
`);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["LEGACY_TYPE_METADATA", "INVALID_TYPE_METADATA"]),
    );
  });

  it("diagnoses duplicate symbols, roles, lenses, temporal misuse, and include cycles", async () => {
    const duplicate = await compileSemLang(`
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
    expect(duplicate.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_TYPE", "DUPLICATE_FIELD", "UNKNOWN_REFINEMENT_TARGET", "UNKNOWN_LENS"]),
    );

    const unknownRole = await compileSemLang(`
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

    const temporal = await compileSemLang(`
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

    const parsed = parseSemLang(`package cycle\ninclude "./self.semlang"\n`, { filePath: "/tmp/self.semlang" });
    expect(parsed.ast).toBeDefined();
    const cycle = parsed.ast
      ? await compileSemLang(`package cycle\ninclude "./self.semlang"\n`, {
          filePath: "/tmp/self.semlang",
          packageLoader: {
            load() {
              return { filePath: "/tmp/self.semlang", source: `package cycle\ninclude "./self.semlang"\n` };
            },
          },
        })
      : undefined;
    expect(cycle?.diagnostics.map((diagnostic) => diagnostic.code)).toContain("INCLUDE_CYCLE");
  });
});
