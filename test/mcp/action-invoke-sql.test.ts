/*
 * Purpose: Verifies MCP invoke_action SQL generation and execution behavior for action edits.
 * Encapsulation: Keep invoke_action SQL tool coverage here; shared MCP fixture helpers belong in test/mcp/helpers.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { duckDbDatabasePath, expectOk, text, writeTempProject } from "./helpers.js";

describe("SemLang MCP action SQL generation", () => {
  async function setActionOntology(
    source: string,
    config?: Record<string, unknown>,
  ): Promise<ReturnType<typeof createSemLangMcp>> {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({
      "model.semlang": source,
    });
    const configPath = path.join(projectDir, "malloy-config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        config ?? {
          connections: {
            warehouse: {
              is: "duckdb",
              databasePath: duckDbDatabasePath(projectDir),
              workingDirectory: projectDir,
            },
          },
        },
        null,
        2,
      ),
    );
    const loaded = await mcp.tools["load_ontology"]({
      paths: [path.join(projectDir, "model.semlang")],
    });
    expectOk(loaded);
    return mcp;
  }

  // Covers: 02.05.019, 02.05.020, 02.05.021, 06.10.004
  it("generates UPDATE SQL from a compiled row selector for subject:single", async () => {
    const mcp = await setActionOntology(`
package mcp.action_update

concept ReturnLine is event from warehouse.table('return_lines') {
  identity return_line_id :: string
  field:
    return_status :: string writeable
    refund_amount :: number writeable
  occurrence_time: now()
  action settle_return {
    subject: single
    param:
      approved_refund_amount :: number
    guard:
      return_status = 'approved'
    edit:
      set return_status = 'settled'
      set refund_amount = approved_refund_amount
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { return_line_id: "RET-1" },
      params: { approved_refund_amount: 12.5 },
      dry_run_only: true,
    });
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      operation: "update",
      engine: "malloy",
    });
    const sql = text(result.sql);
    expect(sql).toContain('UPDATE "return_lines" AS root');
    expect(sql).toContain("WHERE EXISTS (SELECT 1");
    expect(sql).toContain('SELECT root."return_line_id" AS "__id_0",');
    expect(sql).toContain("WHERE root.\"return_line_id\" = 'RET-1' AND (root.\"return_status\" = 'approved')");
    expect(sql).toContain('SET "return_status" = (SELECT src."__set_0"');
    expect(sql).toContain('"refund_amount" = (SELECT src."__set_1"');
    expect(sql).not.toContain("RETURNING");
  });

  // Covers: 06.10.006
  it("rejects write selectors that reference fanout joins", async () => {
    const mcp = await setActionOntology(`
package mcp.action_fanout_update

concept ReturnComment is kind from warehouse.table('return_comments') {
  identity return_comment_id :: string
  field:
    return_line_id :: string
    sentiment :: string
}

concept ReturnLine is event from warehouse.table('return_lines') {
  identity return_line_id :: string
  field:
    return_status :: string writeable
  occurrence_time: now()
  join_many comments: ReturnComment on return_line_id = comments.return_line_id
  action triage_return {
    subject: single
    guard:
      comments.sentiment = 'negative'
    edit:
      set return_status = 'needs_review'
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "triage_return",
      target: { return_line_id: "RET-1" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({
      ok: false,
      engine: "malloy",
      diagnostics: expect.arrayContaining([
        "Action SQL lowering cannot use join_many join comments; write selectors must not fan out target identities.",
      ]),
    });
  });

  // Covers: 06.10.005
  it("quotes schema-qualified table path components separately", async () => {
    const mcp = await setActionOntology(`
package mcp.action_schema_path

concept ReturnLine is event from warehouse.table('analytics.return_lines') {
  identity return_line_id :: string
  field:
    return_status :: string writeable
  occurrence_time: now()
  action settle_return {
    subject: single
    edit:
      set return_status = 'settled'
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { return_line_id: "RET-1" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({ ok: true, skipped: true, operation: "update" });
    const sql = text(result.sql);
    expect(sql).toContain('UPDATE "analytics"."return_lines" AS root');
    expect(sql).toContain('FROM "analytics"."return_lines" AS root');
    expect(sql).not.toContain('"analytics.return_lines"');
  });

  it("generates UPDATE SQL with joined-table expressions", async () => {
    const mcp = await setActionOntology(`
package mcp.action_joined_update

concept ReturnCase is kind from warehouse.table('return_cases') {
  identity return_case_id :: string
  field:
    severity :: string
}

concept ReturnLine is event from warehouse.table('return_lines') {
  identity return_line_id :: string
  field:
    return_case_id :: string
    return_status :: string writeable
  occurrence_time: now()
  join_one return_case: ReturnCase on return_case_id = return_case.return_case_id
  action triage_return {
    subject: single
    edit:
      set return_status = case when return_case.severity = 'high' then 'expedite' else 'standard' end
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "triage_return",
      target: { where: "return_line_id = 'RET-2'" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      operation: "update",
      engine: "malloy",
    });
    const sql = text(result.sql);
    expect(sql).toContain('LEFT JOIN "return_cases" AS return_case');
    expect(sql).toContain('return_case."severity"');
    expect(sql).toContain('SET "return_status" = (SELECT src."__set_0"');
  });

  // Covers: 06.06.003, 06.06.005
  it("generates UPDATE SQL for raw SQL write mappings", async () => {
    const mcp = await setActionOntology(`
package mcp.action_raw_sql_update

concept CustomerContact is kind from warehouse.table('customer_contacts') {
  identity customer_contact_id :: string
  field:
    email_search :: string writeable {
      write: sql "email_search_vector = to_tsvector('english', {value})"
    }
  action index_email {
    subject: single
    param:
      email :: string
    edit:
      set email_search = email
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "CustomerContact",
      action: "index_email",
      target: { customer_contact_id: "CON-1" },
      params: { email: "ada@example.com" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({ ok: true, skipped: true, operation: "update" });
    const sql = text(result.sql);
    expect(sql).toContain("to_tsvector('english', 'ada@example.com') AS \"__set_0\"");
    expect(sql).toContain('SET "email_search_vector" = (SELECT src."__set_0"');
  });

  // Covers: 06.06.003, 06.06.005
  it("generates INSERT SQL for raw SQL write mappings", async () => {
    const mcp = await setActionOntology(`
package mcp.action_raw_sql_insert

concept CustomerContact is kind from warehouse.table('customer_contacts') {
  identity customer_contact_id :: string
  field:
    email_search :: string writeable {
      write: sql "email_search_vector = to_tsvector('english', {value})"
    }
  action create_contact {
    subject: new
    param:
      email :: string
    edit:
      insert {
        email_search: email
      }
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "CustomerContact",
      action: "create_contact",
      target: { customer_contact_id: "CON-1" },
      params: { email: "ada@example.com" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({ ok: true, skipped: true, operation: "insert" });
    const sql = text(result.sql);
    expect(sql).toContain('INSERT INTO "customer_contacts" ("customer_contact_id", "email_search_vector")');
    expect(sql).toContain("to_tsvector('english', 'ada@example.com')");
  });

  // Covers: 06.07.008
  it("generates DELETE SQL from a compiled row selector for subject:collection", async () => {
    const mcp = await setActionOntology(`
package mcp.action_delete

concept SupportCase is kind from warehouse.table('support_cases') {
  identity support_case_id :: string
  field:
    case_status :: string writeable
  action purge_closed {
    subject: collection
    guard:
      case_status = 'closed'
    edit:
      delete
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "SupportCase",
      action: "purge_closed",
      target: { where: "support_case_id in ['C-1', 'C-2']" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      operation: "delete",
      engine: "malloy",
    });
    const sql = text(result.sql);
    expect(sql).toContain('DELETE FROM "support_cases" AS root');
    expect(sql).toContain("WHERE EXISTS (SELECT 1");
    expect(sql).toContain('SELECT root."support_case_id" AS "__id_0"');
    expect(sql).toContain("WHERE support_case_id in ('C-1', 'C-2') AND (root.\"case_status\" = 'closed')");
  });

  it("rejects blank normalized where predicates for subject actions", async () => {
    const mcp = await setActionOntology(`
package mcp.action_blank_where

concept ReturnLine is event from warehouse.table('return_lines') {
  identity return_line_id :: string
  field:
    return_status :: string writeable
  occurrence_time: now()
  action settle_return {
    subject: single
    edit:
      set return_status = 'settled'
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { where: "this." },
      dry_run_only: true,
    });
    expect(result).toMatchObject({
      ok: false,
      engine: "malloy",
      diagnostics: expect.arrayContaining(["where must contain a non-empty predicate for invoke_action."]),
    });
  });

  // Covers: 02.05.022
  it("applies a default SQL timeout for action execution", async () => {
    const mcp = await setActionOntology(`
package mcp.action_timeout

concept ReturnLine is event from warehouse.table('return_lines') {
  identity return_line_id :: string
  field:
    return_status :: string writeable
  occurrence_time: now()
  action settle_return {
    subject: single
    edit:
      set return_status = 'settled'
  }
}
`);

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { return_line_id: "RET-1" },
    });
    expect(result).toMatchObject({
      ok: false,
      engine: "malloy",
      query_limit_seconds: 30,
      timed_out: false,
    });

    // Covers: 02.05.023
    const stringLimitResult = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { return_line_id: "RET-1" },
      query_limit_seconds: "45",
    });
    expect(stringLimitResult).toMatchObject({
      ok: false,
      engine: "malloy",
      query_limit_seconds: 45,
      timed_out: false,
    });

    // Covers: 02.05.023
    const oversizedStringLimit = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { return_line_id: "RET-1" },
      query_limit_seconds: "2147484",
    });
    expect(oversizedStringLimit).toMatchObject({
      ok: false,
      error: expect.stringContaining("no greater than 2147483"),
    });
  });

  it("generates action SQL for non-DuckDB Malloy connection names", async () => {
    const mcp = await setActionOntology(
      `
package mcp.action_non_duckdb

concept ReturnLine is event from warehouse.table('return_lines') {
  identity return_line_id :: string
  field:
    return_status :: string writeable
  occurrence_time: now()
  action settle_return {
    subject: single
    edit:
      set return_status = 'settled'
  }
}
`,
      {
        connections: {
          warehouse: {
            is: "databricks",
            server: "example.cloud.databricks.com",
            token: "test-token",
            path: "/sql/1.0/warehouses/test",
            catalog: "main",
            schema: "analytics",
          },
        },
      },
    );

    const result = await mcp.tools["invoke_action"]({
      concept: "ReturnLine",
      action: "settle_return",
      target: { return_line_id: "RET-1" },
      dry_run_only: true,
    });
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
      engine: "malloy",
    });
    expect(text(result.sql)).toContain('UPDATE "return_lines" AS root');
  });
});
