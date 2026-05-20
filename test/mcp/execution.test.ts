// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import {
  asObject,
  duckDbDatabasePath,
  duckDbMalloyConfig,
  execFileAsync,
  expectOk,
  expectQuery,
  records,
  text,
  writeTempProject,
} from "./helpers.js";

describe("SemLang MCP execution narratives", () => {
  it("runs temporary queries through Malloy execution with a configured DuckDB connection", async () => {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({
      "malloy-config.json": JSON.stringify(duckDbMalloyConfig(""), null, 2),
    });
    await fs.writeFile(
      path.join(projectDir, "malloy-config.json"),
      JSON.stringify(duckDbMalloyConfig(projectDir), null, 2),
    );

    const source = await mcp.tools.set_ontology_source({
      basePath: path.join(projectDir, "inline.semlang"),
      source: `
package mcp.default_duckdb

concept InlineOrder is event from duckdb.sql("""
  select * from (
    values
      ('ORD-1', timestamp '2026-01-01 10:00:00', 10.25),
      ('ORD-2', timestamp '2026-01-02 11:00:00', 20.75)
  ) as orders(order_id, ordered_at, order_amount)
""") {
  identity order_id :: string
  field:
    ordered_at :: timestamp
    order_amount :: number
  occurrence_time: ordered_at

  measure:
    order_count is count()
    total_order_amount is sum(order_amount)
}
`,
    });
    expectOk(source);
    expect(asObject(asObject(source.context).execution)).toMatchObject({
      malloyConfigSource: "discovered",
    });

    const run = await mcp.tools.query_run({
      root: "InlineOrder",
      aggregate: ["order_count", "total_order_amount"],
    });
    expectOk(run);
    expect(run).toMatchObject({
      queryName: "__mcp_query",
      root: "InlineOrder",
    });
    expect(text(run.queryMalloy)).toContain("query: __mcp_query is");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({
      ok: true,
      engine: "malloy",
    });
    expect(records(execution.rows)[0]).toMatchObject({
      order_count: 2,
    });
  });

  it("emits valid Malloy when two concepts reference each other", async () => {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({});
    await execFileAsync(
      "duckdb",
      [
        duckDbDatabasePath(projectDir),
        "-c",
        `
create table customers (
  customer_id varchar primary key,
  customer_name varchar
);
create table orders (
  order_id varchar primary key,
  customer_id varchar references customers(customer_id),
  ordered_at timestamp
);
insert into customers values ('C-1', 'Ada'), ('C-2', 'Grace');
insert into orders values
  ('O-1', 'C-1', timestamp '2026-01-01 10:00:00'),
  ('O-2', 'C-1', timestamp '2026-01-02 10:00:00');
`,
      ],
      {
        cwd: projectDir,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    await fs.writeFile(
      path.join(projectDir, "malloy-config.json"),
      JSON.stringify(duckDbMalloyConfig(projectDir), null, 2),
    );

    const source = await mcp.tools.set_ontology_source({
      basePath: path.join(projectDir, "reciprocal.semlang"),
      source: `
package mcp.reciprocal_sources

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  join_many orders: Order on customer_id
  field:
    customer_name :: string
  measure:
    order_count is orders.count()
}

concept Order is event from duckdb.table('orders') {
  identity order_id :: string
  occurrence_time: ordered_at
  join_one customer: Customer on customer_id
  field:
    customer_id :: string
    ordered_at :: timestamp
}

query: customer_order_counts is Customer -> {
  group_by:
    customer_id
  aggregate:
    order_count
}
`,
    });
    expectOk(source);

    const run = await mcp.tools.query_run({ query: "customer_order_counts" });
    expectQuery(run, "customer_order_counts", "Customer");
    expect(text(run.malloy)).toContain("join_many: orders is __semlang_base_orders");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true, engine: "malloy" });
    expect(records(execution.rows)).toEqual(
      expect.arrayContaining([expect.objectContaining({ customer_id: "C-1", order_count: 2 })]),
    );
  });
});
