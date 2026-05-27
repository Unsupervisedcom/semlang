// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

/*
 * Purpose: Verifies source-loading argument normalization edge cases.
 * Encapsulation: Keep load_ontology source argument precedence coverage here; broader MCP settings coverage belongs in config.test.ts.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { expectOk, writeTempProject } from "./helpers.js";

describe("SemLang MCP source loading narratives", () => {
  it("loads configured ontology when deprecated paths input is explicitly empty", async () => {
    // 02.05.040 and 02.05.041: no-source loading uses the configured ontology
    // entrypoint, even when legacy paths-shaped input arrives empty.
    const projectDir = await writeTempProject({
      ".semlang/settings.yml": ["ontology:", "  entrypoint: model.semlang", ""].join("\n"),
      "model.semlang": "package mcp.empty_paths\n",
    });
    const mcp = createSemLangMcp({ projectDir });

    const source = await mcp.tools["load_ontology"]({ paths: [] });

    expectOk(source);
    expect(mcp.getContext().filePath).toBe(path.join(projectDir, "model.semlang"));
  });
});
