import { describe, expect, it } from "vitest";
import { compileSemLang, parseSemLang } from "../src/index.js";
import type { Diagnostic } from "../src/types.js";

// Requirement coverage: diagnostic structure, missing/duplicate/unresolved
// declarations, invalid syntax, stage safety, include/lens cycles, temporal
// misuse, and aggregate alias diagnostics.
// 05.01.001, 05.01.002, 05.01.003, 05.01.004, 05.01.005, 05.01.006, 05.01.007, 05.01.008
// 05.01.009, 05.01.010, 05.01.011, 05.01.012, 05.01.013, 05.01.014, 05.02.001, 05.02.002, 05.02.003
// 05.07.001, 05.07.002, 05.07.003, 05.07.004, 05.07.005, 05.07.008
// 05.02.004, 05.02.005, 05.02.006

function source(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function diagnostic(result: { diagnostics: Diagnostic[] }, code: string): Diagnostic {
  const found = result.diagnostics.find((item) => item.code === code);
  expect(found, `Expected diagnostic ${code}, got ${result.diagnostics.map((item) => item.code).join(", ")}`).toBeDefined();
  return found!;
}

function expectDiagnostic(
  result: { diagnostics: Diagnostic[] },
  code: string,
  expected: { message: RegExp; line: number; column: number; file?: string }
) {
  expect(diagnostic(result, code)).toMatchObject({
    code,
    severity: "error",
    message: expect.stringMatching(expected.message),
    location: expected.file
      ? { file: expected.file, line: expected.line, column: expected.column }
      : { line: expected.line, column: expected.column }
  });
}

function expectWarning(
  result: { diagnostics: Diagnostic[] },
  code: string,
  expected: { message: RegExp; line: number; column: number; file?: string }
) {
  expect(diagnostic(result, code)).toMatchObject({
    code,
    severity: "warning",
    message: expect.stringMatching(expected.message),
    location: expected.file
      ? { file: expected.file, line: expected.line, column: expected.column }
      : { line: expected.line, column: expected.column }
  });
}

describe("compiler diagnostics", () => {
  it("reports parse errors with understandable messages and source positions", () => {
    const invalidConcept = parseSemLang(source([
      "package bad.parse",
      "concept Broken kind {"
    ]), { filePath: "/work/bad_parse.semlang" });

    expectDiagnostic(invalidConcept, "INVALID_CONCEPT_DECL", {
      message: /Invalid concept declaration/,
      file: "/work/bad_parse.semlang",
      line: 2,
      column: 1
    });
    expect(invalidConcept.ast).toBeUndefined();

    const invalidQuery = parseSemLang(source([
      "package bad.query",
      "query: broken is Order {"
    ]));

    expectDiagnostic(invalidQuery, "INVALID_QUERY_DECL", {
      message: /Invalid query declaration/,
      line: 2,
      column: 1
    });

    const unclosedBlock = parseSemLang(source([
      "package bad.unclosed",
      "concept Broken is kind from duckdb.table('broken') {",
      "  identity id :: string"
    ]));

    expectDiagnostic(unclosedBlock, "UNCLOSED_BLOCK", {
      message: /Unclosed block starting on line 2/,
      line: 2,
      column: 1
    });
  });

  it("reports a missing package declaration at the start of the file", () => {
    const result = parseSemLang(source([
      "concept Customer is kind from duckdb.table('customers') {",
      "  identity customer_id :: string",
      "}"
    ]), { filePath: "/work/no_package.semlang" });

    expectDiagnostic(result, "MISSING_PACKAGE", {
      message: /must declare a package/,
      file: "/work/no_package.semlang",
      line: 1,
      column: 1
    });
  });

  it("reports unresolved symbols where they are introduced", async () => {
    const result = await compileSemLang(source([
      "package bad.unresolved",
      "type: Id is string {",
      "}",
      "concept Sale is event from duckdb.table('sales') {",
      "  identity sale_id :: MissingType",
      "  join_one customer: MissingCustomer on customer_id",
      "  field:",
      "    customer_id :: Id",
      "  measure:",
      "    bad_total is sum(nope.amount)",
      "}",
      "query: missing_root is MissingSale -> {",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expectDiagnostic(result, "UNKNOWN_TYPE", {
      message: /Unknown type MissingType/,
      line: 5,
      column: 12
    });
    expectDiagnostic(result, "UNKNOWN_JOIN_TARGET", {
      message: /targets unknown concept or role MissingCustomer/,
      line: 6,
      column: 3
    });
    expectDiagnostic(result, "UNKNOWN_PATH", {
      message: /Unknown path nope.amount from Sale/,
      line: 10,
      column: 5
    });
    expectDiagnostic(result, "UNKNOWN_QUERY_ROOT", {
      message: /targets unknown concept MissingSale/,
      line: 12,
      column: 1
    });
  });

  it("reports duplicate declarations on the duplicate line", async () => {
    const result = await compileSemLang(source([
      "package bad.duplicates",
      "type: Id is string {",
      "}",
      "type: Id is string {",
      "}",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: Id",
      "  field:",
      "    status :: string",
      "    status :: string",
      "  role Active when status = 'active'",
      "  role Active when status = 'enabled'",
      "}",
      "concept Account is kind from duckdb.table('accounts_archive') {",
      "  identity archive_id :: Id",
      "}",
      "query: q is Account -> {",
      "  aggregate:",
      "    rows is count()",
      "}",
      "query: q is Account -> {",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expectDiagnostic(result, "DUPLICATE_TYPE", {
      message: /Duplicate type Id/,
      line: 4,
      column: 1
    });
    expectDiagnostic(result, "DUPLICATE_FIELD", {
      message: /Duplicate field status on Account/,
      line: 10,
      column: 5
    });
    expectDiagnostic(result, "DUPLICATE_ROLE", {
      message: /Duplicate role Active on Account/,
      line: 12,
      column: 3
    });
    expectDiagnostic(result, "DUPLICATE_CONCEPT", {
      message: /Duplicate concept Account/,
      line: 14,
      column: 1
    });
    expectDiagnostic(result, "DUPLICATE_QUERY", {
      message: /Duplicate query q/,
      line: 21,
      column: 1
    });
  });

  it("allows duplicate role short names and reports ambiguous bare role tests", async () => {
    const ambiguous = await compileSemLang(source([
      "package bad.roles",
      "concept Customer is kind from duckdb.table('customers') {",
      "  identity customer_id :: string",
      "  role Active when customer_id is not null",
      "}",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: string",
      "  field:",
      "    customer_id :: string",
      "  join_one customer: Customer on customer_id",
      "  role Active when account_id is not null",
      "}",
      "concept Sale is event from duckdb.table('sales') {",
      "  identity sale_id :: string",
      "}",
      "query: q is Sale -> {",
      "  where: sale_id is Active",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expectDiagnostic(ambiguous, "AMBIGUOUS_ROLE", {
      message: /Ambiguous role Active; use a qualified role name/,
      line: 17,
      column: 3
    });

    const pathInferred = await compileSemLang(source([
      "package good.roles",
      "concept Customer is kind from duckdb.table('customers') {",
      "  identity customer_id :: string",
      "  role Active when customer_id is not null",
      "}",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: string",
      "  field:",
      "    customer_id :: string",
      "  join_one customer: Customer on customer_id",
      "  role Active when account_id is not null",
      "}",
      "query: q is Account -> {",
      "  where: customer is Active",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expect(pathInferred.diagnostics).toEqual([]);
  });

  it("reports bad lenses with the query or lens line that caused the failure", async () => {
    const unknownLens = await compileSemLang(source([
      "package bad.lens",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: string",
      "}",
      "query: q is Account with missing_lens -> {",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expectDiagnostic(unknownLens, "UNKNOWN_LENS", {
      message: /Unknown lens missing_lens/,
      line: 5,
      column: 1
    });

    const unknownRefinement = await compileSemLang(source([
      "package bad.refinement",
      "lens: broken is {",
      "  refine: MissingConcept extend {",
      "    field:",
      "      reason :: string",
      "  }",
      "}"
    ]));

    expectDiagnostic(unknownRefinement, "UNKNOWN_REFINEMENT_TARGET", {
      message: /refines unknown concept MissingConcept/,
      line: 3,
      column: 3
    });

    const invalidLensMember = await compileSemLang(source([
      "package bad.lens_member",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: string",
      "}",
      "lens: broken is {",
      "  refine: Account extend {",
      "    field:",
      "      status :: MissingType",
      "  }",
      "}",
      "query: q is Account with broken -> {",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expectDiagnostic(invalidLensMember, "UNKNOWN_TYPE", {
      message: /Unknown type MissingType/,
      line: 8,
      column: 7
    });

    const cycle = await compileSemLang(source([
      "package bad.lens_cycle",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: string",
      "}",
      "lens: first is second extend {",
      "}",
      "lens: second is first extend {",
      "}",
      "query: q is Account with first -> {",
      "  aggregate:",
      "    rows is count()",
      "}"
    ]));

    expectDiagnostic(cycle, "LENS_CYCLE", {
      message: /Lens cycle detected: first -> second -> first/,
      line: 7,
      column: 1
    });
  });

  it("reports include cycles at the include that closes the cycle", async () => {
    const filePath = "/work/self.semlang";
    const result = await compileSemLang(source([
      "package bad.cycle",
      "include \"./self.semlang\""
    ]), {
      filePath,
      packageLoader: {
        load() {
          return {
            filePath,
            source: source([
              "package bad.cycle",
              "include \"./self.semlang\""
            ])
          };
        }
      }
    });

    expectDiagnostic(result, "INCLUDE_CYCLE", {
      message: /Include cycle detected at .*self\.semlang/,
      file: filePath,
      line: 2,
      column: 1
    });
  });

  it("reports temporal join misuse on the join declaration", async () => {
    const result = await compileSemLang(source([
      "package bad.temporal",
      "concept Product is kind from duckdb.table('products') {",
      "  identity product_id :: string",
      "}",
      "concept SaleLine is event from duckdb.table('sale_lines') {",
      "  identity line_id :: string",
      "  field:",
      "    product_id :: string",
      "    sold_at :: timestamp",
      "  join_one product: Product on product_id at sold_at",
      "}"
    ]));

    expectDiagnostic(result, "INVALID_TEMPORAL_JOIN", {
      message: /Join product uses at but Product has no valid_time/,
      line: 10,
      column: 3
    });
  });

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
      "}"
    ]);

    const compiled = await compileSemLang(missingTemporalAxes);
    expect(compiled.diagnostics).toEqual([]);

    const missing = await compileSemLang(missingTemporalAxes, { lintWarnings: true });

    expectDiagnostic(missing, "MISSING_TEMPORAL_AXIS", {
      message: /Concept Sale is an event but does not declare occurrence_time/,
      line: 2,
      column: 1
    });
    expect(missing.diagnostics.filter((item) => item.code === "MISSING_TEMPORAL_AXIS").map((item) => item.message)).toEqual([
      "Concept Sale is an event but does not declare occurrence_time.",
      "Concept InventorySnapshot is a situation but does not declare observation_time."
    ]);

    const present = await compileSemLang(source([
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
      "}"
    ]), { lintWarnings: true });

    expect(present.diagnostics).toEqual([]);
  });

  it("warns about likely missing joins from semantic identifier types", async () => {
    const result = await compileSemLang(source([
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
      "}"
    ]), { lintWarnings: true });

    expectWarning(result, "MISSING_JOIN_CANDIDATE", {
      message: /Account\.customer_id.*identifies Customer.*optional join to Customer/,
      line: 14,
      column: 5
    });

    const joined = await compileSemLang(source([
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
      "}"
    ]), { lintWarnings: true });

    expect(joined.diagnostics.filter((item) => item.code === "MISSING_JOIN_CANDIDATE")).toEqual([]);
  });

  it("warns when a field name matches a semantic type but uses another type", async () => {
    const result = await compileSemLang(source([
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
      "}"
    ]), { lintWarnings: true });

    expectWarning(result, "FIELD_TYPE_NAME_MISMATCH", {
      message: /MessageTrackingWithSynthetics\.offer_id is typed as number.*matches semantic type OfferId/,
      line: 8,
      column: 5
    });
  });

  it("warns when repeated identifier fields use inconsistent semantic types", async () => {
    const result = await compileSemLang(source([
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
      "}"
    ]), { lintWarnings: true });

    expectWarning(result, "INCONSISTENT_SEMANTIC_TYPE", {
      message: /customer_id uses inconsistent semantic types.*Customer\.customer_id :: CustomerId.*SupportTicket\.customer_id :: string/,
      line: 6,
      column: 12
    });
    expect(result.diagnostics.filter((item) => item.code === "INCONSISTENT_SEMANTIC_TYPE")).toHaveLength(2);
  });

  it("reports aggregate aliases that expose raw row fields", async () => {
    const result = await compileSemLang(source([
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
      "}"
    ]));

    expectDiagnostic(result, "RAW_FIELD_IN_AGGREGATE_ALIAS", {
      message: /Aggregate alias raw_customer references raw row field customer_id/,
      line: 10,
      column: 5
    });
    expect(result.diagnostics.filter((item) => item.code === "RAW_FIELD_IN_AGGREGATE_ALIAS").map((item) => item.message)).toEqual(expect.arrayContaining([
      expect.stringMatching(/mixed_total references raw row field customer_id/)
    ]));
  });

  it("reports unknown query and nested view references on the use site", async () => {
    const result = await compileSemLang(source([
      "package bad.views",
      "concept Sale is event from duckdb.table('sales') {",
      "  identity sale_id :: string",
      "}",
      "query: direct is Sale -> missing_view",
      "query: nested is Sale -> {",
      "  nest:",
      "    also_missing",
      "}"
    ]));

    expectDiagnostic(result, "UNKNOWN_VIEW", {
      message: /Query direct targets unknown view missing_view on Sale/,
      line: 5,
      column: 1
    });
    expect(result.diagnostics.filter((item) => item.code === "UNKNOWN_VIEW").map((item) => item.message)).toEqual(expect.arrayContaining([
      expect.stringMatching(/Nest references unknown view also_missing on Sale/)
    ]));
  });
});
