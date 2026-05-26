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

  it("previews generated SemLang project config", async () => {
    // 02.05.015, 02.05.035, 02.05.036, and 02.05.037: setup performs
    // heuristic discovery and can preview the .semlang/settings.yml it would write.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-project-"));
    await fs.writeFile(path.join(projectDir, "model.semlang"), "package cli.setup_preview\n");
    await fs.writeFile(path.join(projectDir, "malloy-config.json"), "{}");

    const setup = await execFileAsync("node", ["dist/src/cli.js", "setup", "--preview", "--project-dir", projectDir], {
      cwd: root,
    });

    expect(setup.stdout).toBe(
      [
        "ontology:",
        "  entrypoint: model.semlang",
        "malloy:",
        "  configPath: malloy-config.json",
        "exportDirectory: .semlang/exports",
        "",
      ].join("\n"),
    );
    await expect(fs.access(path.join(projectDir, ".semlang", "settings.yml"))).rejects.toThrow();
  });

  it("writes SemLang config and requires force to overwrite it", async () => {
    // 02.05.036 and 02.05.038: setup writes .semlang/settings.yml, omits absent
    // Malloy config, and protects existing config unless --force is passed.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-project-"));
    await fs.writeFile(path.join(projectDir, "model.semlang"), "package cli.setup_write\n");

    const setup = await execFileAsync("node", [path.join(root, "dist/src/cli.js"), "setup"], { cwd: projectDir });
    expect(setup.stdout).toMatch(/^Wrote .+\.semlang\/settings\.yml\n$/);
    await expect(fs.readFile(path.join(projectDir, ".semlang", "settings.yml"), "utf8")).resolves.toBe(
      ["ontology:", "  entrypoint: model.semlang", "exportDirectory: .semlang/exports", ""].join("\n"),
    );

    await expect(
      execFileAsync("node", [path.join(root, "dist/src/cli.js"), "setup"], { cwd: projectDir }),
    ).rejects.toThrow(/Pass --force to overwrite it/);

    await fs.writeFile(path.join(projectDir, "models.semlang"), "package cli.setup_force\n");
    await execFileAsync("node", [path.join(root, "dist/src/cli.js"), "setup", "--path", "models.semlang", "--force"], {
      cwd: projectDir,
    });
    await expect(fs.readFile(path.join(projectDir, ".semlang", "settings.yml"), "utf8")).resolves.toContain(
      "entrypoint: models.semlang",
    );
  });

  it("reports setup candidates when ontology discovery is ambiguous", async () => {
    // 02.05.037: setup reports candidate files and asks for --path when
    // conventional entrypoint discovery cannot choose one safely.
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-project-"));
    await fs.writeFile(path.join(projectDir, "orders.semlang"), "package cli.orders\n");
    await fs.writeFile(path.join(projectDir, "customers.semlang"), "package cli.customers\n");

    await expect(
      execFileAsync("node", [path.join(root, "dist/src/cli.js"), "setup"], { cwd: projectDir }),
    ).rejects.toThrow(/Candidates: customers\.semlang, orders\.semlang\. Pass --path <file>/);
  });
});
