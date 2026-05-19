import { describe, expect, it } from "vitest";
import { compileOntoql, parseOntoql } from "../src/index.js";

// Requirement coverage: concept-local actions, subject modes, parameters,
// guards, writeable members, write mappings, edits, logs/effects/agent metadata,
// and action non-lowering to Malloy.
// 06.01.001, 06.01.002, 06.01.003, 06.01.004, 06.01.005, 06.01.006, 06.02.001, 06.02.002
// 06.02.003, 06.02.004, 06.02.005, 06.02.006, 06.02.007, 06.02.008, 06.02.009, 06.03.001
// 06.03.002, 06.03.003, 06.03.004, 06.03.005, 06.03.006, 06.04.001, 06.04.002, 06.04.003
// 06.04.004, 06.04.005, 06.05.001, 06.05.002, 06.05.003, 06.05.004, 06.05.005, 06.05.006
// 06.06.001, 06.06.002, 06.06.003, 06.06.004, 06.06.005, 06.06.006, 06.06.007, 06.07.001
// 06.07.002, 06.07.003, 06.07.004, 06.07.005, 06.07.006, 06.07.007, 06.08.001, 06.08.002
// 06.08.003, 06.08.004, 06.09.001, 06.09.002, 06.09.003, 06.09.004, 06.10.001, 06.10.002
// 06.10.003

function source(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function actionFixture(extraConceptLines: string[] = []): string {
  return source([
    "package actions.slice",
    "",
    "type: LotStatus is string {",
    "}",
    "type: QuarantineReason is string {",
    "}",
    "type: EmailAddress is string {",
    "}",
    "",
    "concept SupplierLot is kind from duckdb.table('supplier_lots') {",
    "  identity supplier_lot_id :: string",
    "  field:",
    "    status :: LotStatus writeable",
    "    quarantine_reason :: QuarantineReason? writeable",
    "    normalized_email :: EmailAddress writeable {",
    "      write: column email_normalized = lower(value)",
    "    }",
    "    email_search :: string writeable {",
    "      write: sql \"email_search_vector = to_tsvector('english', {value})\"",
    "    }",
    "  dimension:",
    "    full_name is concat(first_name, ' ', last_name) writeable {",
    "      write:",
    "        column first_name = split_part(value, ' ', 1)",
    "        column last_name = split_part(value, ' ', 2)",
    "    }",
    ...extraConceptLines,
    "  action quarantine {",
    "    subject: single",
    "    param:",
    "      reason :: QuarantineReason",
    "      notify_supplier :: boolean default true hidden",
    "    guard:",
    "      status in ['received', 'released']",
    "        else \"Only received or released lots can be quarantined.\"",
    "    edit:",
    "      set status = 'quarantined'",
    "      set quarantine_reason = reason",
    "    effect after_commit:",
    "      notify supplier {",
    "        when: notify_supplier",
    "      }",
    "    log as SupplierLotActionLog {",
    "      summary: \"Quarantined ${this.supplier_lot_id}\"",
    "      include: reason",
    "    }",
    "    agent:",
    "      expose: true",
    "      risk: high",
    "  }",
    "}"
  ]);
}

describe("OntoQL actions", () => {
  it("parses concept-local actions with subject, params, guards, and edits", () => {
    const result = parseOntoql(actionFixture());

    expect(result.diagnostics).toEqual([]);
    const concept = result.ast?.concepts[0];
    expect(concept?.actions).toHaveLength(1);
    const action = concept?.actions[0];
    expect(action).toMatchObject({
      name: "quarantine",
      subject: { mode: "single" },
      params: [
        { name: "reason", typeName: "QuarantineReason", nullable: false, hidden: false },
        { name: "notify_supplier", typeName: "boolean", defaultExpression: "true", hidden: true }
      ],
      guards: [
        {
          predicate: "status in ['received', 'released']",
          elseMessage: "\"Only received or released lots can be quarantined.\""
        }
      ],
      edits: [
        { kind: "set", target: "status", expression: "'quarantined'" },
        { kind: "set", target: "quarantine_reason", expression: "reason" }
      ]
    });
    expect(action?.effectBlocks[0]).toMatchObject({
      kind: "effect",
      header: "effect after_commit:"
    });
    expect(action?.effectBlocks[0]?.lines).toEqual(expect.arrayContaining(["notify supplier {", "when: notify_supplier"]));
    expect(action?.logBlocks[0]).toMatchObject({
      kind: "log",
      header: "log as SupplierLotActionLog {",
      lines: ["summary: \"Quarantined ${this.supplier_lot_id}\"", "include: reason"]
    });
    expect(action?.agentMetadata).toEqual([
      expect.objectContaining({ key: "expose", value: "true" }),
      expect.objectContaining({ key: "risk", value: "high" })
    ]);
  });

  it("parses writeable fields, dimensions, and write mappings", () => {
    const result = parseOntoql(actionFixture());

    expect(result.diagnostics).toEqual([]);
    const concept = result.ast?.concepts[0];
    expect(concept?.fields.find((field) => field.name === "status")).toMatchObject({
      writeable: true,
      writeMappings: [{ kind: "default" }]
    });
    expect(concept?.fields.find((field) => field.name === "normalized_email")?.writeMappings).toEqual([
      expect.objectContaining({ kind: "column", column: "email_normalized", expression: "lower(value)" })
    ]);
    expect(concept?.fields.find((field) => field.name === "email_search")?.writeMappings).toEqual([
      expect.objectContaining({ kind: "sql", sql: "email_search_vector = to_tsvector('english', {value})" })
    ]);
    expect(concept?.dimensions.find((dimension) => dimension.name === "full_name")).toMatchObject({
      writeable: true,
      writeMappings: [
        { kind: "column", column: "first_name", expression: "split_part(value, ' ', 1)" },
        { kind: "column", column: "last_name", expression: "split_part(value, ' ', 2)" }
      ]
    });
  });

  it("validates action declarations and write mappings", async () => {
    const result = await compileOntoql(source([
      "package actions.bad",
      "",
      "concept BadLot is kind from duckdb.table('bad_lots') {",
      "  identity lot_id :: string",
      "  field:",
      "    status :: string",
      "    note :: string writeable {",
      "      write: sql \"update bad_lots set note = {value}\"",
      "    }",
      "  dimension:",
      "    full_name is concat(first_name, ' ', last_name) writeable",
      "  measure:",
      "    rows is count()",
      "  action duplicate {",
      "    subject: single",
      "  }",
      "  action duplicate {",
      "    subject: single",
      "  }",
      "  action no_subject {",
      "    param:",
      "      reason :: MissingReason",
      "      reason :: string",
      "    edit:",
      "      set status = 'held'",
      "      set nope = 'x'",
      "      set rows = 1",
      "  }",
      "  action bad_subject {",
      "    subject: many",
      "    edit:",
      "      insert {",
      "        status: 'new'",
      "      }",
      "  }",
      "}"
    ]));

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_ACTION",
      "MISSING_ACTION_SUBJECT",
      "INVALID_ACTION_SUBJECT",
      "UNRESOLVED_ACTION_PARAM_TYPE",
      "DUPLICATE_ACTION_PARAM",
      "UNKNOWN_ACTION_TARGET",
      "NON_WRITEABLE_ACTION_TARGET",
      "INVALID_ACTION_EDIT",
      "WRITEABLE_DIMENSION_REQUIRES_MAPPING",
      "INVALID_WRITE_MAPPING"
    ]));
  });

  it("accepts insert assignments only for subject:new", async () => {
    const result = await compileOntoql(source([
      "package actions.insert",
      "",
      "concept RecallCampaign is kind from duckdb.table('recall_campaigns') {",
      "  identity campaign_id :: string",
      "  field:",
      "    title :: string writeable",
      "    status :: string writeable",
      "  action create {",
      "    subject: new",
      "    param:",
      "      title :: string",
      "    edit:",
      "      insert {",
      "        title: title",
      "        status: 'draft'",
      "      }",
      "  }",
      "}"
    ]));

    expect(result.diagnostics).toEqual([]);
    expect(result.model?.concepts.get("RecallCampaign")?.actions[0]?.edits[0]).toMatchObject({
      kind: "insert",
      assignments: [
        { target: "title", expression: "title" },
        { target: "status", expression: "'draft'" }
      ]
    });
  });

  it("preserves collection subject metadata", () => {
    const result = parseOntoql(source([
      "package actions.collection",
      "",
      "concept SupplierLot is kind from duckdb.table('supplier_lots') {",
      "  identity lot_id :: string",
      "  field:",
      "    status :: string writeable",
      "  action bulk_hold {",
      "    subject: collection {",
      "      max: 500",
      "      atomic: true",
      "    }",
      "    edit:",
      "      set status = 'held'",
      "  }",
      "}"
    ]));

    expect(result.diagnostics).toEqual([]);
    expect(result.ast?.concepts[0]?.actions[0]?.subject).toMatchObject({
      mode: "collection",
      metadata: [
        { key: "max", value: "500" },
        { key: "atomic", value: "true" }
      ]
    });
  });

  it("keeps Malloy output focused on read declarations", async () => {
    const result = await compileOntoql(actionFixture([
      "  measure:",
      "    rows is count()"
    ]));

    expect(result.diagnostics).toEqual([]);
    expect(result.malloy).toContain("source: supplier_lots is duckdb.table('supplier_lots') extend");
    expect(result.malloy).toContain("measure:");
    expect(result.malloy).not.toContain("action quarantine");
    expect(result.malloy).not.toContain("writeable");
    expect(result.malloy).not.toContain("write:");
    expect(result.malloy).not.toContain("email_normalized");
  });
});
