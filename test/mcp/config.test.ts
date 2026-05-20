// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { testDuckDbExternalAccessConfig } from "../duckdb-config.js";
import {
  asObject,
  duckDbDatabasePath,
  duckDbMalloyConfig,
  expectOk,
  records,
  text,
  writeTempProject,
} from "./helpers.js";

describe("SemLang MCP config narratives", () => {
  // 02.05.001, 02.05.002, 02.05.003, 02.05.004, 02.05.005,
  // 02.05.006, 02.05.007, and 02.05.008: MCP captures explicit or
  // discovered Malloy config, preserves model connection names, and reports
  // missing config or unsupported connection engines clearly.
  it("captures Malloy project and config context when setting the ontology source", async () => {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({
      "model.semlang": `
package mcp.project_context

concept Order is event from warehouse.table('orders') {
  identity order_id :: string
  field:
    ordered_at :: timestamp
  occurrence_time: ordered_at
}
`,
    });
    const modelPath = path.join(projectDir, "model.semlang");
    const configPath = path.join(projectDir, "malloy-config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          connections: {
            warehouse: {
              is: "duckdb",
              databasePath: duckDbDatabasePath(projectDir),
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

    const source = await mcp.tools.set_ontology_source({
      path: modelPath,
      projectPath: projectDir,
      configPath,
    });
    expectOk(source);
    expect(asObject(source.context)).toMatchObject({
      execution: {
        projectDir,
        malloyConfigPath: configPath,
      },
    });
  });

  it("discovers Malloy config above the SemLang model directory", async () => {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({
      "malloy-config.json": JSON.stringify(duckDbMalloyConfig(""), null, 2),
      "semlang/model.semlang": `
package mcp.parent_config

concept Order is event from duckdb.table('orders') {
  identity order_id :: string
  field:
    ordered_at :: timestamp
  occurrence_time: ordered_at
}
`,
    });
    await fs.writeFile(
      path.join(projectDir, "malloy-config.json"),
      JSON.stringify(duckDbMalloyConfig(projectDir), null, 2),
    );

    const source = await mcp.tools.set_ontology_source({
      path: path.join(projectDir, "semlang", "model.semlang"),
    });
    expectOk(source);
    expect(asObject(source.context)).toMatchObject({
      execution: {
        projectDir,
        malloyConfigPath: path.join(projectDir, "malloy-config.json"),
        malloyConfigSource: "discovered",
      },
    });
  });

  it("fails clearly when no Malloy config path is supplied and discovery finds no config", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      source: `
package mcp.missing_config

concept Sale is event from duckdb.table('sales') {
  identity sale_id :: string
  field:
    sold_at :: timestamp
  occurrence_time: sold_at
}
`,
    });

    expect(source.ok).toBe(false);
    expect(text(source.error)).toContain("No Malloy config file was found for set_ontology_source.");
    expect(text(source.error)).toContain("Pass configPath or malloyConfigPath explicitly");
  });

  it("blocks ontology source loading when emitted Malloy references an unknown source connection", async () => {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({
      "malloy-config.json": JSON.stringify(duckDbMalloyConfig(""), null, 2),
      "model.semlang": `
package mcp.unknown_connection

concept WarehouseOrder is event from warehouse.sql("""
  select 'O-1' as order_id, timestamp '2026-01-01 00:00:00' as ordered_at
""") {
  identity order_id :: string
  field:
    ordered_at :: timestamp
  occurrence_time: ordered_at

  measure:
    order_count is count()
}

query: warehouse_order_count is WarehouseOrder -> {
  aggregate:
    order_count
}
`,
    });
    await fs.writeFile(
      path.join(projectDir, "malloy-config.json"),
      JSON.stringify(duckDbMalloyConfig(projectDir), null, 2),
    );

    const source = await mcp.tools.set_ontology_source({
      path: path.join(projectDir, "model.semlang"),
    });
    expect(source.ok).toBe(false);
    expect(records(source.diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "MALLOY_VALIDATION_ERROR",
          message: expect.stringContaining("warehouse"),
        }),
      ]),
    );
  });

  it("returns a clear error for configured connection engines without registered packages", async () => {
    const mcp = createSemLangMcp();
    const projectDir = await writeTempProject({
      "malloy-config.json": JSON.stringify(
        {
          connections: {
            warehouse: {
              is: "not_registered",
              host: "example.invalid",
            },
          },
        },
        null,
        2,
      ),
      "model.semlang": `
package mcp.unknown_engine

concept WarehouseOrder is event from warehouse.table('orders') {
  identity order_id :: string
  field:
    ordered_at :: timestamp
  occurrence_time: ordered_at

  measure:
    order_count is count()
}

query: warehouse_order_count is WarehouseOrder -> {
  aggregate:
    order_count
}
`,
    });

    const source = await mcp.tools.set_ontology_source({
      path: path.join(projectDir, "model.semlang"),
    });
    expect(source.ok).toBe(false);
    expect(records(source.diagnostics)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "MALLOY_VALIDATION_ERROR",
          message: expect.stringContaining('Malloy connection type "not_registered" is configured'),
        }),
      ]),
    );
  });
});
