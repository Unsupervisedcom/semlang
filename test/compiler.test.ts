/*
 * Purpose: Covers end-to-end compiler behavior for SemLang language features and Malloy emission.
 * Encapsulation: Keep compiler pipeline assertions here; CLI, MCP, and runtime execution have separate test files.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile, compileSemLang, parseSemLang } from "../src/index.js";

// Requirement coverage: type parsing, type validation, JSON Schema export,
// file/source forms, concept members, analytics/lenses, and read lowering.
// 01.01.001, 01.01.002, 01.01.003, 01.01.004, 01.01.005, 01.01.006, 01.01.007, 01.01.008
// 01.02.001
// 01.02.002, 01.02.003, 01.02.004, 01.02.005, 01.02.006, 01.02.007, 01.02.008, 01.02.009
// 01.02.010, 01.02.011, 01.02.012, 01.02.013, 01.02.014, 01.03.001, 01.03.002
// 02.01.001, 02.01.002, 02.01.003, 02.01.004, 02.01.005, 02.01.006, 02.01.007, 02.01.008
// 02.01.009, 02.02.001, 02.02.002, 02.02.003, 02.02.004, 02.02.005, 02.02.006, 02.02.007, 02.03.001
// 02.03.002, 02.03.003, 02.03.004, 02.03.005, 02.03.006, 02.03.007, 02.03.008, 02.03.009
// 02.04.001, 02.04.002, 02.04.003, 02.04.004, 02.04.005, 02.04.006
// 03.01.001, 03.01.002, 03.01.003, 03.01.004, 03.01.005, 03.01.006, 03.01.007, 03.01.008
// 03.01.009, 03.02.001, 03.02.002, 03.02.003, 03.02.004, 03.03.001, 03.03.002, 03.03.003
// 03.03.004, 03.03.005, 03.03.006, 03.04.001, 03.04.002, 03.04.003, 03.04.004, 03.04.005
// 03.04.006, 03.05.001, 03.05.002, 03.05.003, 03.05.004, 03.05.005, 03.05.006, 03.05.007
// 03.05.008, 03.05.009, 03.05.010, 03.05.011, 03.05.012, 03.05.013, 03.05.014, 03.05.015
// 03.06.001, 03.06.002, 03.06.003
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
    expect(result.ast?.queries.map((query) => query.name)).toEqual([
      "monthly_margin_and_returns",
      "recent_order_line_projection",
      "inventory_exceptions",
      "vendor_funded_return_exposure",
      "denver_store_customer_count_on_2025_09_15",
      "same_store_category_health",
    ]);
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

  it("lowers composite identities through generated key dimensions", async () => {
    const result = await compileSemLang(`
package identity.composite

concept AccountAttraction is relator from duckdb.table('account_attractions') {
  identity memberdb_cust_id :: string, attraction_id :: string
  field:
    __semlang_base_primary_key :: string
    attraction_name :: string
  dimension:
    __semlang_primary_key is attraction_name
}
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).not.toContain("primary_key: concat(");
    expect(result.malloy).toContain("primary_key: __semlang_base_primary_key_2");
    expect(result.malloy).toContain("__semlang_base_primary_key_2 is concat(memberdb_cust_id, '|', attraction_id)");
    expect(result.malloy).toContain("primary_key: __semlang_primary_key_2");
    expect(result.malloy).toContain("__semlang_primary_key_2 is concat(memberdb_cust_id, '|', attraction_id)");
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

  // 03.05.007, 03.05.013, 03.05.014
  it("lowers join_one inline source targets as Malloy joins", async () => {
    const result = await compileSemLang(`
package joins.inline_sources

source: customer_profiles is duckdb.table('customer_profiles')

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  join_one profile: duckdb.table('customer_profiles') on customer_id = profile.customer_id
  join_one named_profile: customer_profiles on customer_id = named_profile.customer_id
  dimension:
    profile_email is profile.email
    named_profile_email is named_profile.email
}
`);

    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("join_one: profile is duckdb.table('customer_profiles')");
    expect(result.malloy).toContain("on customer_id = profile.customer_id");
    expect(result.malloy).toContain("join_one: named_profile is customer_profiles");
    expect(result.malloy).toContain("on customer_id = named_profile.customer_id");
    expect(result.malloy).toContain("profile_email is profile.email");
    expect(result.malloy).toContain("named_profile_email is named_profile.email");
  });

  // 03.05.015
  it("rejects inline source targets on join_many", async () => {
    const result = await compileSemLang(`
package joins.inline_sources

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  join_many profiles: duckdb.table('customer_profiles') on customer_id = profiles.customer_id
}
`);

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "INVALID_JOIN",
        message: "Inline source targets are only supported for join_one.",
      }),
    ]);
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
});
