/*
 * Purpose: Verifies parser, resolver, and lint diagnostics for invalid or risky SemLang models.
 * Encapsulation: Keep diagnostic expectations here; successful compilation scenarios belong in compiler tests.
 */

import { describe, expect, it } from "vitest";
import { compileSemLang, parseSemLang } from "../src/index.js";
import { expectDiagnostic, source } from "./diagnostics-helpers.js";

// Requirement coverage: diagnostic structure, missing/duplicate/unresolved
// declarations, invalid syntax, stage safety, include/lens cycles, temporal
// misuse, and aggregate alias diagnostics.
// 05.01.001, 05.01.002, 05.01.003, 05.01.004, 05.01.005, 05.01.006, 05.01.007, 05.01.008
// 05.01.009, 05.01.010, 05.01.011, 05.01.012, 05.01.013, 05.01.014, 05.02.001, 05.02.002, 05.02.003
// 05.07.001, 05.07.002, 05.07.003, 05.07.004, 05.07.005, 05.07.008, 05.07.011
// 05.02.004, 05.02.005, 05.02.006

describe("compiler diagnostics", () => {
  it("reports parse errors with understandable messages and source positions", () => {
    const invalidConcept = parseSemLang(source(["package bad.parse", "concept Broken kind {"]), {
      filePath: "/work/bad_parse.semlang",
    });

    expectDiagnostic(invalidConcept, "INVALID_CONCEPT_DECL", {
      message: /Invalid concept declaration/,
      file: "/work/bad_parse.semlang",
      line: 2,
      column: 1,
    });
    expect(invalidConcept.ast).toBeUndefined();

    const invalidQuery = parseSemLang(source(["package bad.query", "query: broken is Order {"]));

    expectDiagnostic(invalidQuery, "INVALID_QUERY_DECL", {
      message: /Invalid query declaration/,
      line: 2,
      column: 1,
    });

    const unclosedBlock = parseSemLang(
      source([
        "package bad.unclosed",
        "concept Broken is kind from duckdb.table('broken') {",
        "  identity id :: string",
      ]),
    );

    expectDiagnostic(unclosedBlock, "UNCLOSED_BLOCK", {
      message: /Unclosed block starting on line 2/,
      line: 2,
      column: 1,
    });
  });

  it("reports a missing package declaration at the start of the file", () => {
    const result = parseSemLang(
      source(["concept Customer is kind from duckdb.table('customers') {", "  identity customer_id :: string", "}"]),
      { filePath: "/work/no_package.semlang" },
    );

    expectDiagnostic(result, "MISSING_PACKAGE", {
      message: /must declare a package/,
      file: "/work/no_package.semlang",
      line: 1,
      column: 1,
    });
  });

  it("reports unresolved symbols where they are introduced", async () => {
    const result = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expectDiagnostic(result, "UNKNOWN_TYPE", {
      message: /Unknown type MissingType/,
      line: 5,
      column: 12,
    });
    expectDiagnostic(result, "UNKNOWN_JOIN_TARGET", {
      message: /targets unknown concept, role, or source MissingCustomer/,
      line: 6,
      column: 3,
    });
    expectDiagnostic(result, "UNKNOWN_PATH", {
      message: /Unknown path nope.amount from Sale/,
      line: 10,
      column: 5,
    });
    expectDiagnostic(result, "UNKNOWN_QUERY_ROOT", {
      message: /targets unknown concept MissingSale/,
      line: 12,
      column: 1,
    });
  });

  it("reports duplicate declarations on the duplicate line", async () => {
    const result = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expectDiagnostic(result, "DUPLICATE_TYPE", {
      message: /Duplicate type Id/,
      line: 4,
      column: 1,
    });
    expectDiagnostic(result, "DUPLICATE_FIELD", {
      message: /Duplicate field status on Account/,
      line: 10,
      column: 5,
    });
    expectDiagnostic(result, "DUPLICATE_ROLE", {
      message: /Duplicate role Active on Account/,
      line: 12,
      column: 3,
    });
    expectDiagnostic(result, "DUPLICATE_CONCEPT", {
      message: /Duplicate concept Account/,
      line: 14,
      column: 1,
    });
    expectDiagnostic(result, "DUPLICATE_QUERY", {
      message: /Duplicate query q/,
      line: 21,
      column: 1,
    });
  });

  it("allows duplicate role short names and reports ambiguous bare role tests", async () => {
    const ambiguous = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expectDiagnostic(ambiguous, "AMBIGUOUS_ROLE", {
      message: /Ambiguous role Active; use a qualified role name/,
      line: 17,
      column: 3,
    });

    const pathInferred = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expect(pathInferred.diagnostics).toEqual([]);
  });

  it("reports bad lenses with the query or lens line that caused the failure", async () => {
    const unknownLens = await compileSemLang(
      source([
        "package bad.lens",
        "concept Account is kind from duckdb.table('accounts') {",
        "  identity account_id :: string",
        "}",
        "query: q is Account with missing_lens -> {",
        "  aggregate:",
        "    rows is count()",
        "}",
      ]),
    );

    expectDiagnostic(unknownLens, "UNKNOWN_LENS", {
      message: /Unknown lens missing_lens/,
      line: 5,
      column: 1,
    });

    const unknownRefinement = await compileSemLang(
      source([
        "package bad.refinement",
        "lens: broken is {",
        "  refine: MissingConcept extend {",
        "    field:",
        "      reason :: string",
        "  }",
        "}",
      ]),
    );

    expectDiagnostic(unknownRefinement, "UNKNOWN_REFINEMENT_TARGET", {
      message: /refines unknown concept MissingConcept/,
      line: 3,
      column: 3,
    });

    const invalidLensMember = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expectDiagnostic(invalidLensMember, "UNKNOWN_TYPE", {
      message: /Unknown type MissingType/,
      line: 8,
      column: 7,
    });

    const cycle = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expectDiagnostic(cycle, "LENS_CYCLE", {
      message: /Lens cycle detected: first -> second -> first/,
      line: 7,
      column: 1,
    });
  });

  it("reports include cycles at the include that closes the cycle", async () => {
    const filePath = "/work/self.semlang";
    const result = await compileSemLang(source(["package bad.cycle", 'include "./self.semlang"']), {
      filePath,
      packageLoader: {
        load() {
          return {
            filePath,
            source: source(["package bad.cycle", 'include "./self.semlang"']),
          };
        },
      },
    });

    expectDiagnostic(result, "INCLUDE_CYCLE", {
      message: /Include cycle detected at .*self\.semlang/,
      file: filePath,
      line: 2,
      column: 1,
    });
  });

  it("reports temporal join misuse on the join declaration", async () => {
    const result = await compileSemLang(
      source([
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
        "}",
      ]),
    );

    expectDiagnostic(result, "INVALID_TEMPORAL_JOIN", {
      message: /Join product uses at but Product has no valid_time/,
      line: 10,
      column: 3,
    });
  });
});
