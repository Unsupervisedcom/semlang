/*
 * Purpose: Exercises the SemLang CLI as an external process.
 * Encapsulation: Keep command-line integration assertions here; compiler unit behavior belongs in compiler and diagnostics tests.
 */

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
    await execFileAsync(
      "node",
      ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.semlang", "--out", out],
      { cwd: root },
    );
    const malloy = await fs.readFile(out, "utf8");
    expect(malloy).toContain("query: monthly_margin_and_returns is retail_line_items ->");
  });

  it("emits AST and model JSON", async () => {
    const ast = await execFileAsync(
      "node",
      ["dist/src/cli.js", "compile", "examples/retail-omnichannel-margin-and-returns/example.semlang", "--emit", "ast"],
      { cwd: root },
    );
    expect(JSON.parse(ast.stdout).packageName).toBe("retail.omnichannel_margin_returns");

    const model = await execFileAsync(
      "node",
      [
        "dist/src/cli.js",
        "compile",
        "examples/retail-omnichannel-margin-and-returns/example.semlang",
        "--emit",
        "model",
      ],
      { cwd: root },
    );
    expect(JSON.parse(model.stdout).concepts.Sale.source).toMatchObject({
      kind: "table",
      connection: "duckdb",
      path: "transactions",
    });
  });

  it("01.02.013 emits JSON Schema", async () => {
    const schema = await execFileAsync(
      "node",
      [
        "dist/src/cli.js",
        "compile",
        "examples/retail-omnichannel-margin-and-returns/example.semlang",
        "--emit",
        "json-schema",
      ],
      { cwd: root },
    );
    const parsed = JSON.parse(schema.stdout);
    expect(parsed.$vocabulary).toMatchObject({ "https://semlang.dev/vocab/semlang/1": true });
    expect(parsed.$defs["type.ReturnStatus"].enum).toEqual([
      "authorized",
      "received",
      "accepted",
      "rejected",
      "settled",
    ]);
    expect(parsed.$defs["concept.Store"]["x-semlang-stereotype"]).toBe("kind");
  });

  it("rejects invalid enum-like options", async () => {
    await expect(
      execFileAsync(
        "node",
        [
          "dist/src/cli.js",
          "compile",
          "examples/retail-omnichannel-margin-and-returns/example.semlang",
          "--emit",
          "wat",
        ],
        { cwd: root },
      ),
    ).rejects.toThrow(/Allowed choices are ast, model, malloy, json-schema/);

    await expect(
      execFileAsync(
        "node",
        [
          "dist/src/cli.js",
          "compile",
          "examples/retail-omnichannel-margin-and-returns/example.semlang",
          "--unknown-option",
        ],
        { cwd: root },
      ),
    ).rejects.toThrow(/unknown option/);
  });

  it("resolves MCP setup settings from env vars and CLI parameters", async () => {
    // 02.05.015: setup exposes managed path settings sourced from
    // SEMLANG-prefixed env vars with CLI parameters taking precedence.
    // 08.02.006: setup exposes max_parallel_queries as a managed MCP setting.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-project-"));
    const envExportDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-env-export-"));
    const paramExportDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-param-export-"));
    const configPath = path.join(projectDir, "malloy-config.json");
    const paramConfigPath = path.join(projectDir, "param-malloy-config.json");
    await fs.writeFile(configPath, "{}");
    await fs.writeFile(paramConfigPath, "{}");

    const setup = await execFileAsync(
      "node",
      ["dist/src/cli.js", "setup", "--config-path", paramConfigPath, "--export-directory", paramExportDir],
      {
        cwd: root,
        env: {
          ...process.env,
          SEMLANG_PROJECT_DIR: projectDir,
          SEMLANG_MALLOY_CONFIG_PATH: configPath,
          SEMLANG_EXPORT_DIRECTORY: envExportDir,
          SEMLANG_MAX_PARALLEL_QUERIES: "7",
        },
      },
    );

    expect(JSON.parse(setup.stdout)).toMatchObject({
      projectDir,
      malloyConfigPath: paramConfigPath,
      exportDirectory: paramExportDir,
      maxParallelQueries: 7,
    });
  });

  it("defaults MCP setup project and export directories", async () => {
    // 02.05.015: setup exposes managed path settings with defaults that match
    // the MCP process cwd and operating system temp directory.
    const env = { ...process.env };
    delete env.SEMLANG_PROJECT_DIR;
    delete env.SEMLANG_MALLOY_CONFIG_PATH;
    delete env.SEMLANG_EXPORT_DIRECTORY;

    const setup = await execFileAsync("node", ["dist/src/cli.js", "setup"], {
      cwd: root,
      env,
    });

    expect(JSON.parse(setup.stdout)).toMatchObject({
      projectDir: root,
      exportDirectory: os.tmpdir(),
    });
  });
});
