// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { asObject, expectOk, records, setInlineOntology } from "./helpers.js";

describe("SemLang MCP validation and search narratives", () => {
  it("surfaces ignored sources in context and semantic search", async () => {
    const mcp = createSemLangMcp();

    const source = await setInlineOntology(
      mcp,
      `
package mcp.ignored_sources

ignored duckdb.table('legacy_ticket_log') {
  reason: "Deprecated -- replaced by event_transactions as of 2025-Q3"
}

concept EventTransaction is event from duckdb.table('event_transactions') {
  identity event_id :: string
  field:
    occurred_at :: timestamp
  occurrence_time: occurred_at
}
`,
    );
    expectOk(source);
    const context = asObject(source.context);
    expect(records(context.ignored)[0]).toMatchObject({
      source: "duckdb.table('legacy_ticket_log')",
      sourceKind: "table",
      reason: '"Deprecated -- replaced by event_transactions as of 2025-Q3"',
    });

    const search = await mcp.tools.semantic_search_terms({ question: "legacy ticket log deprecated" });
    expectOk(search);
    expect(records(search.ignored)[0]).toMatchObject({
      source: "duckdb.table('legacy_ticket_log')",
      reason: '"Deprecated -- replaced by event_transactions as of 2025-Q3"',
    });
  });

  it("surfaces role qualified names, labels, and aliases in ontology search tools", async () => {
    const mcp = createSemLangMcp();

    const source = await setInlineOntology(
      mcp,
      `
package mcp.role_aliases

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  field:
    status :: string
  role Active when status = 'active' {
    label: "Active Customer"
    aliases: "Current Customer", "Open Customer"
  }
}
`,
    );
    expectOk(source);

    const role = await mcp.tools.ontology_describe_role({ role: "Customer.Active" });
    expectOk(role);
    expect(records(role.roles)[0]).toMatchObject({
      concept: "Customer",
      name: "Active",
      qualifiedName: "Customer.Active",
      label: "Active Customer",
      aliases: ["Current Customer", "Open Customer"],
      predicate: "status = 'active'",
    });

    const search = await mcp.tools.semantic_search_terms({ question: "current customer" });
    expectOk(search);
    const roleMatch = records(search.members).find((member) => member.kind === "role");
    expect(roleMatch).toMatchObject({
      name: "Active",
      concept: "Customer",
      matchedTerms: expect.arrayContaining(["current", "customer"]),
    });

    const entity = await mcp.tools.catalog_resolve_entity({ name: "Open Customer" });
    expectOk(entity);
    expect(records(entity.matches).find((match) => match.kind === "role")).toMatchObject({
      name: "Active",
      concept: "Customer",
    });
  });

  it("returns lint warnings when setting ontology source but not during query validation", async () => {
    // 05.07.001: lint warnings are validation-surface diagnostics and should
    // not be repeated by ordinary query validation.
    const mcp = createSemLangMcp();

    const source = await setInlineOntology(
      mcp,
      `
package mcp.lint_warnings

type: CustomerId is string {
  identifies: Customer
}

type: AccountId is string {
  identifies: Account
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: CustomerId
}

concept Account is kind from duckdb.table('accounts') {
  identity account_id :: AccountId
  field:
    customer_id :: CustomerId
}
`,
    );
    expect(source.ok).toBe(true);
    expect(records(source.diagnostics).map((diagnostic) => diagnostic.code)).toContain("MISSING_JOIN_CANDIDATE");

    const validated = await mcp.tools.query_validate({
      root: "Account",
      aggregate: ["count()"],
    });
    expectOk(validated);
    expect(records(validated.diagnostics).map((diagnostic) => diagnostic.code)).not.toContain("MISSING_JOIN_CANDIDATE");
  });

  it("blocks ontology source loading for lint errors", async () => {
    // 05.07.002 and 05.07.008: lint errors are validation-surface diagnostics
    // and must block ontology source loading.
    const mcp = createSemLangMcp();

    const source = await setInlineOntology(
      mcp,
      `
package mcp.lint_errors

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: string
}
`,
    );

    expect(source.ok).toBe(false);
    expect(records(source.diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "MISSING_TEMPORAL_AXIS",
        }),
      ]),
    );
  });

  it("returns Malloy SDK validation diagnostics when setting ontology source but not during query validation", async () => {
    // 05.07.006 and 05.07.007: ontology loading validates the full emitted
    // Malloy model and fails before bad generated Malloy reaches query use.
    // 05.07.009 and 05.07.010: set_ontology_source returns generated Malloy
    // context and maps Malloy validation diagnostics back to SemLang source
    // locations when source mapping is available.
    const mcp = createSemLangMcp();

    const source = await setInlineOntology(
      mcp,
      `
package mcp.malloy_validation

concept Account is kind from duckdb.sql("""
  select 'A1' as account_id, date '2026-05-01' as last_order_date
""") {
  identity account_id :: string
  field:
    last_order_date :: date

  dimension:
    days_since_last_order is days(now() - last_order_date)
}

query: account_recency is Account -> {
  group_by:
    days_since_last_order
}
`,
    );
    expect(source.ok).toBe(false);
    const diagnostics = records(source.diagnostics);
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "MALLOY_VALIDATION_ERROR",
          message: expect.stringContaining("Malloy validation"),
        }),
      ]),
    );
    const malloyDiagnostic = diagnostics.find((diagnostic) => {
      const generatedLocation = diagnostic.generatedLocation as Record<string, unknown> | undefined;
      return (
        diagnostic.code === "MALLOY_VALIDATION_ERROR" &&
        generatedLocation?.line === 9 &&
        generatedLocation?.column === 38
      );
    });
    expect(malloyDiagnostic).toMatchObject({
      location: {
        file: expect.stringContaining("inline.semlang"),
        line: 11,
        column: 5,
      },
      generatedLocation: {
        file: "generated.malloy",
        line: 9,
        column: 38,
      },
      sourceMapTarget: {
        kind: "dimension",
        label: "Account.days_since_last_order",
      },
    });
    expect(records(malloyDiagnostic?.generatedContext)).toEqual([
      { line: 7, text: "", marker: null },
      { line: 8, text: "  dimension:", marker: null },
      {
        line: 9,
        text: "    days_since_last_order is days(now() - last_order_date)",
        marker: "error",
      },
      { line: 10, text: "}", marker: null },
      { line: 11, text: "", marker: null },
    ]);
  });
});
