import { describe, expect, it } from "vitest";
import { compileOntoql, parseOntoql } from "../src/index.js";
import type { Diagnostic } from "../src/types.js";

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

describe("compiler diagnostics", () => {
  it("reports parse errors with understandable messages and source positions", () => {
    const invalidConcept = parseOntoql(source([
      "package bad.parse",
      "concept Broken kind {"
    ]), { filePath: "/work/bad_parse.ontoql" });

    expectDiagnostic(invalidConcept, "INVALID_CONCEPT_DECL", {
      message: /Invalid concept declaration/,
      file: "/work/bad_parse.ontoql",
      line: 2,
      column: 1
    });
    expect(invalidConcept.ast).toBeUndefined();

    const invalidQuery = parseOntoql(source([
      "package bad.query",
      "query: broken is Order {"
    ]));

    expectDiagnostic(invalidQuery, "INVALID_QUERY_DECL", {
      message: /Invalid query declaration/,
      line: 2,
      column: 1
    });

    const unclosedBlock = parseOntoql(source([
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
    const result = parseOntoql(source([
      "concept Customer is kind from duckdb.table('customers') {",
      "  identity customer_id :: string",
      "}"
    ]), { filePath: "/work/no_package.ontoql" });

    expectDiagnostic(result, "MISSING_PACKAGE", {
      message: /must declare a package/,
      file: "/work/no_package.ontoql",
      line: 1,
      column: 1
    });
  });

  it("reports unresolved symbols where they are introduced", async () => {
    const result = await compileOntoql(source([
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
    const result = await compileOntoql(source([
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

  it("reports globally ambiguous role names", async () => {
    const result = await compileOntoql(source([
      "package bad.roles",
      "concept Customer is kind from duckdb.table('customers') {",
      "  identity customer_id :: string",
      "  role Active when customer_id is not null",
      "}",
      "concept Account is kind from duckdb.table('accounts') {",
      "  identity account_id :: string",
      "  role Active when account_id is not null",
      "}"
    ]));

    expectDiagnostic(result, "DUPLICATE_ROLE", {
      message: /Duplicate global role Active on Account; already declared on Customer/,
      line: 8,
      column: 3
    });
  });

  it("reports bad lenses with the query or lens line that caused the failure", async () => {
    const unknownLens = await compileOntoql(source([
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

    const unknownRefinement = await compileOntoql(source([
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

    const invalidLensMember = await compileOntoql(source([
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

    const cycle = await compileOntoql(source([
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
    const filePath = "/work/self.ontoql";
    const result = await compileOntoql(source([
      "package bad.cycle",
      "include \"./self.ontoql\""
    ]), {
      filePath,
      packageLoader: {
        load() {
          return {
            filePath,
            source: source([
              "package bad.cycle",
              "include \"./self.ontoql\""
            ])
          };
        }
      }
    });

    expectDiagnostic(result, "INCLUDE_CYCLE", {
      message: /Include cycle detected at .*self\.ontoql/,
      file: filePath,
      line: 2,
      column: 1
    });
  });

  it("reports temporal join misuse on the join declaration", async () => {
    const result = await compileOntoql(source([
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

  it("reports aggregate aliases that expose raw row fields", async () => {
    const result = await compileOntoql(source([
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
    const result = await compileOntoql(source([
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
