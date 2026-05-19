import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

describe("CLI", () => {
  it("emits Malloy to a file", async () => {
    const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "ontoql-cli-")), "model.malloy");
    await execFileAsync("node", [
      "dist/src/cli.js",
      "compile",
      "examples/retail-omnichannel-margin-and-returns/example.ontoql",
      "--out",
      out
    ], { cwd: root });
    const malloy = await fs.readFile(out, "utf8");
    expect(malloy).toContain("query: monthly_margin_and_returns is retail_line_items ->");
  });

  it("emits AST and model JSON", async () => {
    const ast = await execFileAsync("node", ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.ontoql", "--emit", "ast"], { cwd: root });
    expect(JSON.parse(ast.stdout).packageName).toBe("retail.omnichannel_margin_returns");

    const model = await execFileAsync("node", ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.ontoql", "--emit", "model"], { cwd: root });
    expect(JSON.parse(model.stdout).concepts.Sale.table).toBe("transactions");
  });

  it("rejects invalid enum-like options", async () => {
    await expect(execFileAsync("node", [
      "dist/src/cli.js",
      "compile",
      "examples/retail-omnichannel-margin-and-returns/example.ontoql",
      "--emit",
      "wat"
    ], { cwd: root })).rejects.toThrow(/Allowed choices are ast, model, malloy/);

    await expect(execFileAsync("node", [
      "dist/src/cli.js",
      "compile",
      "examples/retail-omnichannel-margin-and-returns/example.ontoql",
      "--source-mode",
      "postgres"
    ], { cwd: root })).rejects.toThrow(/Allowed choices are bare, duckdb/);
  });
});
