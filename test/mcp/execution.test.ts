// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

/*
 * Purpose: Verifies MCP query.run validation, execution, limits, and exported result behavior.
 * Encapsulation: Keep MCP query execution assertions here; lower-level Malloy runtime coverage belongs in test/malloy-execution.test.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { prettyJsonLineCount } from "../../src/mcp.js";
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
      projectDir,
      return_malloy_model: true,
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
    // 02.05.013: Full compiled Malloy is available on source load only when requested.
    expect(text(source.malloyModel)).toContain("source: inline_order is __semlang_base_inline_order extend");

    const missingLimit = await mcp.tools.query_run({
      root: "InlineOrder",
      aggregate: ["order_count"],
    });
    expect(missingLimit).toMatchObject({
      ok: false,
      error: expect.stringContaining("query_limit_seconds"),
    });
    // 02.05.016: query.run failures still include a transaction id for traceability.
    expect(text(asObject(missingLimit.execution).transactionId)).toMatch(/^[0-9a-f-]{36}$/);

    const invalidQuery = await mcp.tools.query_run({
      query: "does_not_exist",
      query_limit_seconds: 30,
    });
    expect(invalidQuery).toMatchObject({
      ok: false,
      error: expect.any(String),
    });
    expect(text(asObject(invalidQuery.execution).transactionId)).toMatch(/^[0-9a-f-]{36}$/);

    // 02.05.024: temporary query.run calls use the cached Malloy base model
    // from set_ontology_source instead of recompiling the stored source text.
    mcp.getContext().sourceText = "package mcp.corrupted\nthis is no longer valid SemLang";

    // 02.05.009 and 02.05.010: query.run requires an explicit
    // query_limit_seconds execution limit and returns elapsed runtime.
    const run = await mcp.tools.query_run({
      root: "InlineOrder",
      aggregate: ["order_count", "total_order_amount"],
      query_limit_seconds: 30,
    });
    expectOk(run);
    expect(run).toMatchObject({
      queryName: "__mcp_query",
      root: "InlineOrder",
    });
    // 02.05.012: query.run keeps the default response compact by omitting the full Malloy model.
    expect(run).not.toHaveProperty("malloy");
    expect(text(run.queryMalloy)).toContain("query: __mcp_query is");
    const execution = asObject(run.execution);
    // 02.05.018: query.run execution responses keep a compact public shape.
    expect(Object.keys(execution).sort()).toEqual([
      "execution_time_ms",
      "malloyConfig",
      "ok",
      "rows",
      "totalRows",
      "transactionId",
    ]);
    expect(execution).toMatchObject({
      ok: true,
      execution_time_ms: expect.any(Number),
    });
    expect(records(execution.rows)[0]).toMatchObject({
      order_count: 2,
    });

    // 02.05.023: MCP argument serialization can pass numeric execution controls
    // as strings, and query.run still treats valid integer seconds as deadlines.
    const stringLimitRun = await mcp.tools.query_run({
      root: "InlineOrder",
      aggregate: ["order_count"],
      query_limit_seconds: "30",
    });
    expectOk(stringLimitRun);
    expect(records(asObject(stringLimitRun.execution).rows)[0]).toMatchObject({
      order_count: 2,
    });

    // 02.05.023: string deadlines still have to fit within the runtime timer
    // ceiling so Node does not clamp an oversized timeout.
    const oversizedStringLimit = await mcp.tools.query_run({
      root: "InlineOrder",
      aggregate: ["order_count"],
      query_limit_seconds: "2147484",
    });
    expect(oversizedStringLimit).toMatchObject({
      ok: false,
      error: expect.stringContaining("no greater than 2147483"),
    });

    const exportDir = await fs.mkdtemp(path.join(projectDir, "exports-"));
    // 02.05.016 and 02.05.017: query.run returns a transaction id and exports
    // row output larger than 10 lines to a transaction-named file.
    const largeRun = await mcp.tools.query_run({
      root: "InlineOrder",
      group_by: ["order_id", "ordered_at", "order_amount"],
      query_limit_seconds: 30,
      export_directory: exportDir,
    });
    expectOk(largeRun);
    const largeExecution = asObject(largeRun.execution);
    const transactionId = text(largeExecution.transactionId);
    expect(transactionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(largeExecution).toMatchObject({
      ok: true,
      totalRows: expect.any(Number),
    });
    expect(Object.keys(largeExecution).sort()).toEqual([
      "execution_time_ms",
      "malloyConfig",
      "ok",
      "output",
      "totalRows",
      "transactionId",
    ]);
    const output = asObject(largeExecution.output);
    expect(output).toMatchObject({
      exported: true,
      path: path.join(exportDir, `${transactionId}.json`),
    });
    expect(Number(output.lineCount)).toBeGreaterThan(10);
    const exported = JSON.parse(await fs.readFile(text(output.path), "utf8"));
    expect(exported).toMatchObject({
      transactionId,
      queryName: "__mcp_query",
    });
    expect(exported.rows.length).toBeGreaterThan(0);
    expect(output.lineCount).toBe(prettyJsonLineCount(exported.rows));
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
      projectDir,
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

    // 02.05.014: dry_run_only validates and returns query Malloy without executing.
    const dryRun = await mcp.tools.query_run({ query: "customer_order_counts", dry_run_only: true });
    expectQuery(dryRun, "customer_order_counts", "Customer");
    expect(dryRun).not.toHaveProperty("malloy");
    expect(text(dryRun.queryMalloy)).toContain("query: customer_order_counts is customers ->");
    expect(asObject(dryRun.execution)).toMatchObject({ skipped: true });

    const run = await mcp.tools.query_run({ query: "customer_order_counts", query_limit_seconds: 30 });
    expectQuery(run, "customer_order_counts", "Customer");
    expect(run).not.toHaveProperty("malloy");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true });
    expect(records(execution.rows)).toEqual(
      expect.arrayContaining([expect.objectContaining({ customer_id: "C-1", order_count: 2 })]),
    );
  });
});
