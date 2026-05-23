/*
 * Purpose: Covers compiler behavior for source metadata, query compatibility, expressions, roles, and JSON Schema projection.
 * Encapsulation: Keep compiler metadata assertions here; parser basics and include behavior have separate test files.
 */

import { describe, expect, it } from "vitest";
import { compileSemLang, parseSemLang } from "../src/index.js";

type JsonSchemaObject = Record<string, unknown> & {
  properties?: Record<string, unknown>;
};

describe("SemLang compiler metadata and projection", () => {
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
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "MISSING_IGNORED_REASON",
      "IGNORED_SOURCE_MODELED",
      "DUPLICATE_IGNORED_SOURCE",
      "IGNORED_SOURCE_MODELED",
    ]);
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
    expect(missingIdentity.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["JOIN_WITH_REQUIRES_IDENTITY"]);

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
    expect(missingForeignKey.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["UNKNOWN_PATH"]);
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
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "UNKNOWN_TYPE",
      "UNKNOWN_JOIN_TARGET",
      "UNKNOWN_PATH",
      "UNKNOWN_TYPE",
      "UNKNOWN_JOIN_TARGET",
      "UNKNOWN_PATH",
      "RAW_FIELD_IN_AGGREGATE_ALIAS",
    ]);
  });

  // 03.03.007, 03.04.007, and 04.02.007: identities, fields,
  // dimensions, and measures accept block-level descriptions.
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
  identity customer_id :: CustomerId {
    description: "Stable customer source key."
  }
  field:
    email :: string? unique {
      description: "Primary contact email for the customer."
    }
    status :: CustomerStatus
    lifetime_value :: Dollars
  dimension:
    status_label :: string is status {
      description: "Customer status label exposed for grouping."
    }
  measure:
    customer_rows :: number is count() {
      description: "Count of customer rows."
    }
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
      description: "Stable customer source key.",
      "x-semlang-identity": true,
    });
    expect(customerProperties.email).toMatchObject({
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Primary contact email for the customer.",
      "x-semlang-unique": true,
    });
    expect(customerSchema["x-semlang-dimensions"]).toEqual([
      expect.objectContaining({
        name: "status_label",
        description: "Customer status label exposed for grouping.",
      }),
    ]);
    expect(customerSchema["x-semlang-measures"]).toEqual([
      expect.objectContaining({
        name: "customer_rows",
        description: "Count of customer rows.",
      }),
    ]);
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
});
