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
    const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "semlang-cli-")), "model.malloy");
    await execFileAsync("node", [
      "dist/src/cli.js",
      "compile",
      "examples/retail-omnichannel-margin-and-returns/example.semlang",
      "--out",
      out
    ], { cwd: root });
    const malloy = await fs.readFile(out, "utf8");
    expect(malloy).toContain("query: monthly_margin_and_returns is retail_line_items ->");
  });

  it("emits AST and model JSON", async () => {
    const ast = await execFileAsync("node", ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.semlang", "--emit", "ast"], { cwd: root });
    expect(JSON.parse(ast.stdout).packageName).toBe("retail.omnichannel_margin_returns");

    const model = await execFileAsync("node", ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.semlang", "--emit", "model"], { cwd: root });
    expect(JSON.parse(model.stdout).concepts.Sale.source).toMatchObject({
      kind: "table",
      connection: "duckdb",
      path: "transactions"
    });
  });

  it("01.02.013 emits JSON Schema", async () => {
    const schema = await execFileAsync("node", ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.semlang", "--emit", "json-schema"], { cwd: root });
    const parsed = JSON.parse(schema.stdout);
    expect(parsed.$vocabulary).toMatchObject({ "https://semlang.dev/vocab/semlang/1": true });
    expect(parsed.$defs["type.ReturnStatus"].enum).toEqual(["authorized", "received", "accepted", "rejected", "settled"]);
    expect(parsed.$defs["concept.Store"]["x-semlang-stereotype"]).toBe("kind");
  });

  it("rejects invalid enum-like options", async () => {
    await expect(execFileAsync("node", [
      "dist/src/cli.js",
      "compile",
      "examples/retail-omnichannel-margin-and-returns/example.semlang",
      "--emit",
      "wat"
    ], { cwd: root })).rejects.toThrow(/Allowed choices are ast, model, malloy, json-schema/);

    await expect(execFileAsync("node", [
      "dist/src/cli.js",
      "compile",
      "examples/retail-omnichannel-margin-and-returns/example.semlang",
      "--unknown-option"
    ], { cwd: root })).rejects.toThrow(/unknown option/);
  });
});
