/*
 * Purpose: Verifies lint diagnostics for risky SemLang models.
 * Encapsulation: Keep lint warning expectations here; parser and resolver error diagnostics live in diagnostics tests.
 */

import { describe, expect, it } from "vitest";
import { compileSemLang } from "../src/index.js";
import { expectDiagnostic, expectWarning, source } from "./diagnostics-helpers.js";

describe("compiler lint diagnostics", () => {
  it("emits lint diagnostics only when requested", async () => {
    const missingTemporalAxes = source([
      "package warn.temporal_axes",
      "concept Sale is event from duckdb.table('sales') {",
      "  identity sale_id :: string",
      "}",
      "concept InventorySnapshot is situation from duckdb.table('inventory_snapshots') {",
      "  identity snapshot_id :: string",
      "}",
      "concept Customer is kind from duckdb.table('customers') {",
      "  identity customer_id :: string",
      "}",
    ]);

    const compiled = await compileSemLang(missingTemporalAxes);
    expect(compiled.diagnostics).toEqual([]);

    const missing = await compileSemLang(missingTemporalAxes, { lintWarnings: true });

    expectDiagnostic(missing, "MISSING_TEMPORAL_AXIS", {
      message: /Concept Sale is an event but does not declare occurrence_time/,
      line: 2,
      column: 1,
    });
    expect(
      missing.diagnostics.filter((item) => item.code === "MISSING_TEMPORAL_AXIS").map((item) => item.message),
    ).toEqual([
      "Concept Sale is an event but does not declare occurrence_time.",
      "Concept InventorySnapshot is a situation but does not declare observation_time.",
    ]);

    const present = await compileSemLang(
      source([
        "package good.temporal_axes",
        "concept Sale is event from duckdb.table('sales') {",
        "  identity sale_id :: string",
        "  field:",
        "    sold_at :: timestamp",
        "  occurrence_time: sold_at",
        "}",
        "concept InventorySnapshot is situation from duckdb.table('inventory_snapshots') {",
        "  identity snapshot_id :: string",
        "  field:",
        "    observed_at :: timestamp",
        "  observation_time: observed_at",
        "}",
      ]),
      { lintWarnings: true },
    );

    expect(present.diagnostics).toEqual([]);
  });

  it("warns about likely missing joins from semantic identifier types", async () => {
    const result = await compileSemLang(
      source([
        "package warn.join_candidates",
        "type: CustomerId is string {",
        "  identifies: Customer",
        "}",
        "type: AccountId is string {",
        "  identifies: Account",
        "}",
        "concept Customer is kind from duckdb.table('customers') {",
        "  identity customer_id :: CustomerId",
        "}",
        "concept Account is kind from duckdb.table('accounts') {",
        "  identity account_id :: AccountId",
        "  field:",
        "    customer_id :: CustomerId",
        "}",
      ]),
      { lintWarnings: true },
    );

    expectWarning(result, "MISSING_JOIN_CANDIDATE", {
      message: /Account\.customer_id.*identifies Customer.*optional join to Customer/,
      line: 14,
      column: 5,
    });

    const joined = await compileSemLang(
      source([
        "package good.join_candidates",
        "type: CustomerId is string {",
        "  identifies: Customer",
        "}",
        "type: AccountId is string {",
        "  identifies: Account",
        "}",
        "concept Customer is kind from duckdb.table('customers') {",
        "  identity customer_id :: CustomerId",
        "}",
        "concept Account is kind from duckdb.table('accounts') {",
        "  identity account_id :: AccountId",
        "  field:",
        "    customer_id :: CustomerId",
        "  join_one customer?: Customer with customer_id",
        "}",
      ]),
      { lintWarnings: true },
    );

    expect(joined.diagnostics.filter((item) => item.code === "MISSING_JOIN_CANDIDATE")).toEqual([]);
  });

  it("warns when a field name matches a semantic type but uses another type", async () => {
    const result = await compileSemLang(
      source([
        "package warn.field_type_names",
        "type: OfferId is string {",
        "  identifies: Offer",
        "}",
        "concept MessageTrackingWithSynthetics is event from duckdb.table('message_tracking') {",
        "  identity tracking_id :: string",
        "  field:",
        "    offer_id :: number",
        "    sent_at :: timestamp",
        "  occurrence_time: sent_at",
        "}",
      ]),
      { lintWarnings: true },
    );

    expectWarning(result, "FIELD_TYPE_NAME_MISMATCH", {
      message: /MessageTrackingWithSynthetics\.offer_id is typed as number.*matches semantic type OfferId/,
      line: 8,
      column: 5,
    });
  });

  it("warns when a field name shadows a SemLang keyword", async () => {
    const sourceText = source([
      "package warn.keyword_fields",
      "concept HistoricalRecommendation is kind from duckdb.table('historical_recommendations') {",
      "  identity recommendation_id :: string",
      "  field:",
      "    measure :: number",
      "  where: measure > 0",
      "  dimension:",
      "    measurement_value is measure",
      "}",
    ]);

    // 05.07.011: keyword-shadowing diagnostics are validation lint warnings.
    const defaultCompile = await compileSemLang(sourceText);
    expect(defaultCompile.diagnostics).toEqual([]);

    const linted = await compileSemLang(sourceText, { lintWarnings: true });
    expectWarning(linted, "FIELD_NAME_SHADOWS_KEYWORD", {
      message: /HistoricalRecommendation\.measure.*SemLang keyword measure.*bare name in expressions.*measure:/,
      line: 5,
      column: 5,
    });
  });

  it("tailors keyword-shadowing warnings for identity names and non-section keywords", async () => {
    const result = await compileSemLang(
      source([
        "package warn.keyword_identity",
        "concept RankedResult is kind from duckdb.table('ranked_results') {",
        "  identity top :: string",
        "  field:",
        "    project :: string",
        "    writeable :: boolean",
        "}",
      ]),
      { lintWarnings: true },
    );

    // 05.07.011: keyword-shadowing diagnostics cover identities, section
    // headers, query aliases such as top/project, and field modifiers.
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "FIELD_NAME_SHADOWS_KEYWORD",
        message: expect.stringMatching(/Identity field RankedResult\.top.*top:/),
        location: { line: 3, column: 12 },
      }),
      expect.objectContaining({
        severity: "warning",
        code: "FIELD_NAME_SHADOWS_KEYWORD",
        message: expect.stringMatching(/Field RankedResult\.project.*project:/),
        location: { line: 5, column: 5 },
      }),
      expect.objectContaining({
        severity: "warning",
        code: "FIELD_NAME_SHADOWS_KEYWORD",
        message: expect.not.stringMatching(/writeable:/),
        location: { line: 6, column: 5 },
      }),
    ]);
  });

  it("warns when repeated identifier fields use inconsistent semantic types", async () => {
    const result = await compileSemLang(
      source([
        "package warn.semantic_types",
        "type: CustomerId is string {",
        "  identifies: Customer",
        "}",
        "concept Customer is kind from duckdb.table('customers') {",
        "  identity customer_id :: CustomerId",
        "}",
        "concept SupportTicket is kind from duckdb.table('support_tickets') {",
        "  identity ticket_id :: string",
        "  field:",
        "    customer_id :: string",
        "}",
      ]),
      { lintWarnings: true },
    );

    expectWarning(result, "INCONSISTENT_SEMANTIC_TYPE", {
      message:
        /customer_id uses inconsistent semantic types.*Customer\.customer_id :: CustomerId.*SupportTicket\.customer_id :: string/,
      line: 6,
      column: 12,
    });
    expect(result.diagnostics.filter((item) => item.code === "INCONSISTENT_SEMANTIC_TYPE")).toHaveLength(2);
  });

  it("reports aggregate aliases that expose raw row fields", async () => {
    const result = await compileSemLang(
      source([
        "package bad.aggregate",
        "concept SaleLine is event from duckdb.table('sale_lines') {",
        "  identity line_id :: string",
        "  field:",
        "    customer_id :: string",
        "    amount :: number",
        "}",
        "query: q is SaleLine -> {",
        "  aggregate:",
        "    raw_customer is customer_id",
        "    total_amount is sum(amount)",
        "    mixed_total is sum(amount) + customer_id",
        "}",
      ]),
    );

    expectDiagnostic(result, "RAW_FIELD_IN_AGGREGATE_ALIAS", {
      message: /Aggregate alias raw_customer references raw row field customer_id/,
      line: 10,
      column: 5,
    });
    expect(
      result.diagnostics.filter((item) => item.code === "RAW_FIELD_IN_AGGREGATE_ALIAS").map((item) => item.message),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/mixed_total references raw row field customer_id/)]));
  });

  it("reports unknown query and nested view references on the use site", async () => {
    const result = await compileSemLang(
      source([
        "package bad.views",
        "concept Sale is event from duckdb.table('sales') {",
        "  identity sale_id :: string",
        "}",
        "query: direct is Sale -> missing_view",
        "query: nested is Sale -> {",
        "  nest:",
        "    also_missing",
        "}",
      ]),
    );

    expectDiagnostic(result, "UNKNOWN_VIEW", {
      message: /Query direct targets unknown view missing_view on Sale/,
      line: 5,
      column: 1,
    });
    expect(result.diagnostics.filter((item) => item.code === "UNKNOWN_VIEW").map((item) => item.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Nest references unknown view also_missing on Sale/)]),
    );
  });
});
