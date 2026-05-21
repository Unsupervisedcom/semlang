import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileSemLang } from "../src/index.js";
import { executeMalloyQuery, validateMalloyModel } from "../src/malloy-execution.js";
import { testDuckDbExternalAccessConfig } from "./duckdb-config.js";

async function writeMalloyConfig(projectDir: string): Promise<string> {
  const configPath = path.join(projectDir, "malloy-config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        connections: {
          duckdb: {
            is: "duckdb",
            workingDirectory: projectDir,
            ...testDuckDbExternalAccessConfig(),
            extensionDirectory: path.join(projectDir, ".duckdb-extensions"),
          },
        },
      },
      null,
      2,
    ),
  );
  return configPath;
}

describe("Malloy SDK validation", () => {
  it("rejects execution work that exceeds the query limit deadline", async () => {
    // 02.05.011: timeout paths report an execution error when the query limit
    // deadline expires, and the worker running Malloy execution is terminated.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-query-timeout-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const result = await executeMalloyQuery({
      context: { projectDir, malloyConfigPath },
      malloy: 'query: q is duckdb.sql("""select 1 as one""") -> { select: one }',
      queryName: "q",
      queryLimitSeconds: 0.001,
    });

    expect(result).toMatchObject({
      ok: false,
      timed_out: true,
      error: expect.stringContaining("query_limit_seconds=0.001"),
      execution_time_ms: expect.any(Number),
    });
  });

  it("accepts emitted Malloy for composite identity concepts", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-composite-identity-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const compiled = await compileSemLang(`
package identity.composite

concept AccountAttraction is relator from duckdb.sql("""
  select 'A1' as memberdb_cust_id, 'T1' as attraction_id
""") {
  identity memberdb_cust_id :: string, attraction_id :: string
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const malloy = compiled.malloy ?? "";
    expect(malloy).toContain("source: account_attraction is __semlang_base_account_attraction extend");
    expect(malloy).not.toContain("primary_key: concat(");
    const diagnostics = await validateMalloyModel({
      context: { projectDir, malloyConfigPath },
      malloy,
    });

    expect(diagnostics).toEqual([]);
  });

  it("runs with joins against composite identity targets", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-composite-join-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const compiled = await compileSemLang(`
package identity.composite_join

concept AccountAttraction is relator from duckdb.sql("""
  select 'A1' as memberdb_cust_id, 'T1' as attraction_id, 'The Show' as attraction_name
""") {
  identity memberdb_cust_id :: string, attraction_id :: string
  field:
    attraction_name :: string
}

concept MessageTracking is event from duckdb.sql("""
  select 'M1' as message_id, 'A1' as memberdb_cust_id, 'T1' as attraction_id, timestamp '2026-05-20 12:00:00' as sent_at
""") {
  identity message_id :: string
  field:
    memberdb_cust_id :: string
    attraction_id :: string
  occurrence_time: sent_at
  join_one account_attraction: AccountAttraction with concat(memberdb_cust_id, '|', attraction_id)
}

query: message_attractions is MessageTracking -> {
  group_by:
    message_id
    attraction_name is account_attraction.attraction_name
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const malloy = compiled.malloy ?? "";
    expect(malloy).toContain("join_one: account_attraction is");
    expect(malloy).toContain("with concat(memberdb_cust_id, '|', attraction_id)");
    const result = await executeMalloyQuery({
      context: { projectDir, malloyConfigPath },
      malloy,
      queryName: "message_attractions",
      queryLimitSeconds: 30,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{ message_id: "M1", attraction_name: "The Show" }]);
  });

  it("runs join_many relationships over composite key fields", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-composite-has-many-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const compiled = await compileSemLang(`
package identity.composite_has_many

concept MessageTracking is event from duckdb.sql("""
  select 'M1' as message_id, 'A1' as memberdb_cust_id, 'T1' as attraction_id, timestamp '2026-05-20 12:00:00' as sent_at
  union all
  select 'M2' as message_id, 'A1' as memberdb_cust_id, 'T1' as attraction_id, timestamp '2026-05-20 12:05:00' as sent_at
  union all
  select 'M3' as message_id, 'A2' as memberdb_cust_id, 'T1' as attraction_id, timestamp '2026-05-20 12:10:00' as sent_at
""") {
  identity message_id :: string
  field:
    memberdb_cust_id :: string
    attraction_id :: string
  occurrence_time: sent_at
}

concept AccountAttraction is relator from duckdb.sql("""
  select 'A1' as memberdb_cust_id, 'T1' as attraction_id, 'The Show' as attraction_name
""") {
  identity memberdb_cust_id :: string, attraction_id :: string
  field:
    attraction_name :: string
  join_many messages: MessageTracking on memberdb_cust_id = messages.memberdb_cust_id and attraction_id = messages.attraction_id
}

query: account_attraction_messages is AccountAttraction -> {
  group_by:
    attraction_name
  aggregate:
    message_count is messages.count()
}
`);

    expect(compiled.diagnostics).toEqual([]);
    const malloy = compiled.malloy ?? "";
    expect(malloy).toContain("join_many: messages is");
    expect(malloy).toContain(
      "on memberdb_cust_id = messages.memberdb_cust_id and attraction_id = messages.attraction_id",
    );
    const result = await executeMalloyQuery({
      context: { projectDir, malloyConfigPath },
      malloy,
      queryName: "account_attraction_messages",
      queryLimitSeconds: 30,
    });

    expect(result.ok).toBe(true);
    expect(result.rows).toEqual([{ attraction_name: "The Show", message_count: 2 }]);
  });

  it("converts Malloy model problems into SemLang diagnostics with generated context", async () => {
    // 05.07.009: Malloy validation diagnostics include nearby generated
    // Malloy context lines when Malloy provides line information.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-malloy-validation-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const diagnostics = await validateMalloyModel({
      context: { projectDir, malloyConfigPath },
      malloy: `
source: accounts is duckdb.sql("""select 'A1' as account_id, date '2026-05-01' as last_order_date""") extend {
  primary_key: account_id

  dimension:
    days_since_last_order is days(now() - last_order_date)
}
`,
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "MALLOY_VALIDATION_ERROR",
          message: expect.stringContaining("Malloy validation"),
        }),
      ]),
    );
    const malloyDiagnostic = diagnostics.find((diagnostic) =>
      diagnostic.message.includes("extraneous input '(' expecting ')'"),
    );
    expect(malloyDiagnostic?.location).toMatchObject({
      file: "generated.malloy",
      line: 6,
      column: 38,
    });
    expect(malloyDiagnostic?.generatedLocation).toEqual({
      file: "generated.malloy",
      line: 6,
      column: 38,
    });
    expect(malloyDiagnostic?.generatedContext).toEqual([
      { line: 4, text: "" },
      { line: 5, text: "  dimension:" },
      {
        line: 6,
        text: "    days_since_last_order is days(now() - last_order_date)",
        marker: "error",
      },
      { line: 7, text: "}" },
      { line: 8, text: "" },
    ]);
  });

  it("maps Malloy validation diagnostics back to SemLang source locations", async () => {
    // 05.07.010: when source mapping is available, Malloy validation
    // diagnostics prefer the original SemLang source location and preserve the
    // generated Malloy location separately.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-malloy-validation-source-map-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const filePath = path.join(projectDir, "model.semlang");
    const compiled = await compileSemLang(
      `package identity.malloy_source_map

concept Account is kind from duckdb.sql("""
  select 'A1' as account_id, date '2026-05-01' as last_order_date
""") {
  identity account_id :: string
  field:
    last_order_date :: date

  dimension:
    days_since_last_order is days(now() - last_order_date)
}
`,
      { filePath },
    );

    expect(compiled.diagnostics).toEqual([]);
    const malloy = compiled.malloy ?? "";
    const sourceMap = compiled.malloySourceMap ?? [];
    expect(malloy.split("\n")[8]).toBe("    days_since_last_order is days(now() - last_order_date)");
    expect(sourceMap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          generatedStartLine: 9,
          generatedEndLine: 9,
          location: {
            file: filePath,
            line: 11,
            column: 5,
          },
          kind: "dimension",
          label: "Account.days_since_last_order",
        }),
      ]),
    );
    const diagnostics = await validateMalloyModel({
      context: { projectDir, malloyConfigPath },
      malloy,
      sourceMap,
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "MALLOY_VALIDATION_ERROR",
          location: {
            file: filePath,
            line: 11,
            column: 5,
          },
          generatedLocation: {
            file: "generated.malloy",
            line: 9,
            column: 38,
          },
          generatedContext: [
            { line: 7, text: "" },
            { line: 8, text: "  dimension:" },
            {
              line: 9,
              text: "    days_since_last_order is days(now() - last_order_date)",
              marker: "error",
            },
            { line: 10, text: "}" },
            { line: 11, text: "" },
          ],
          sourceMapTarget: {
            kind: "dimension",
            label: "Account.days_since_last_order",
          },
        }),
      ]),
    );
  });
});
