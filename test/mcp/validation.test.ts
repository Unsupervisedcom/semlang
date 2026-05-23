// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

/*
 * Purpose: Verifies MCP source validation and diagnostic responses for invalid ontology inputs.
 * Encapsulation: Keep MCP validation behavior here; compiler diagnostic details belong in test/diagnostics.test.ts.
 */

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

    const search = await mcp.tools["search"]({ query: "legacy ticket log deprecated" });
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

    const role = await mcp.tools["describe"]({ kind: "role", names: ["Customer.Active"] });
    expectOk(role);
    expect(records(role.roles)[0]).toMatchObject({
      concept: "Customer",
      name: "Active",
      qualifiedName: "Customer.Active",
      label: "Active Customer",
      aliases: ["Current Customer", "Open Customer"],
      predicate: "status = 'active'",
    });

    const search = await mcp.tools["search"]({ query: "current customer" });
    expectOk(search);
    const roleMatch = records(search.members).find((member) => member.kind === "role");
    expect(roleMatch).toMatchObject({
      name: "Active",
      concept: "Customer",
      matchedTerms: expect.arrayContaining(["current", "customer"]),
    });

    const entity = await mcp.tools["search"]({ kind: "entity", query: "Open Customer" });
    expectOk(entity);
    expect(records(entity.matches).find((match) => match.kind === "role")).toMatchObject({
      name: "Active",
      concept: "Customer",
    });
  });

  it("surfaces member descriptions in ontology introspection and semantic search", async () => {
    // 03.03.008, 03.04.008, and 04.02.008: member descriptions are preserved
    // for MCP ontology introspection and search.
    const mcp = createSemLangMcp();

    const source = await setInlineOntology(
      mcp,
      `
package mcp.member_descriptions

concept Booking is kind from duckdb.table('bookings') {
  identity booking_id :: string {
    description: "Stable booking key used by support."
  }
  field:
    amount :: number {
      description: "Booked commercial value before refunds."
    }
  dimension:
    amount_band :: string is case when amount > 100 then 'large' else 'standard' end {
      description: "Commercial booking size bucket."
    }
  measure:
    booked_value :: number is sum(amount) {
      description: "Total booked commercial value."
    }
}
`,
    );
    expectOk(source);

    const described = await mcp.tools["describe"]({ kind: "concept", names: ["Booking"] });
    expectOk(described);
    const concept = asObject(described.concept);
    expect(records(concept.identities)[0]).toMatchObject({
      name: "booking_id",
      description: "Stable booking key used by support.",
    });
    expect(records(concept.fields)[0]).toMatchObject({
      name: "amount",
      description: "Booked commercial value before refunds.",
    });
    expect(records(concept.dimensions)[0]).toMatchObject({
      name: "amount_band",
      description: "Commercial booking size bucket.",
    });
    expect(records(concept.measures)[0]).toMatchObject({
      name: "booked_value",
      description: "Total booked commercial value.",
    });

    const describedMultiple = await mcp.tools["describe"]({ kind: "concept", names: ["Booking", "Booking"] });
    expectOk(describedMultiple);
    expect(records(describedMultiple.results)).toHaveLength(2);

    const metric = await mcp.tools["describe"]({ kind: "metric", names: ["booked_value"] });
    expectOk(metric);
    expect(records(metric.metrics)[0]).toMatchObject({
      name: "booked_value",
      description: "Total booked commercial value.",
    });

    const search = await mcp.tools["search"]({ query: "commercial value" });
    expectOk(search);
    expect(records(search.metrics)[0]).toMatchObject({ name: "booked_value" });
    expect(records(search.members).map((member) => member.name)).toEqual(
      expect.arrayContaining(["amount", "amount_band", "booked_value"]),
    );
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
    measure :: number
}
`,
    );
    expect(source.ok).toBe(true);
    expect(records(source.diagnostics).map((diagnostic) => diagnostic.code)).toContain("MISSING_JOIN_CANDIDATE");
    expect(records(source.diagnostics).map((diagnostic) => diagnostic.code)).toContain("FIELD_NAME_SHADOWS_KEYWORD");

    // 02.05.014: dry_run_only preserves query validation without requiring execution.
    const validated = await mcp.tools["run_query"]({
      dry_run_only: true,
      root: "Account",
      body: { aggregate: ["count()"] },
    });
    expectOk(validated);
    expect(records(validated.diagnostics).map((diagnostic) => diagnostic.code)).not.toContain("MISSING_JOIN_CANDIDATE");
    expect(records(validated.diagnostics).map((diagnostic) => diagnostic.code)).not.toContain(
      "FIELD_NAME_SHADOWS_KEYWORD",
    );
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
    // 05.07.009 and 05.07.010: load_ontology returns generated Malloy
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
