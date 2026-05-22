/*
 * Purpose: Locks npm package and release automation metadata to the public distribution contract.
 * Encapsulation: Keep repository packaging checks here; runtime CLI behavior belongs in CLI tests.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

describe("package publishing metadata", () => {
  it("configures the root npm package for public semlang distribution", async () => {
    // 07.01.001, 07.01.002, 07.01.003, 07.01.004, 07.01.005: npm metadata
    // must keep the public package name, CLI command, and obfuscated built
    // library artifacts publishable.
    const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

    expect(packageJson).toMatchObject({
      name: "semlang",
      bin: { semlang: "./bin/semlang.js" },
      main: "./dist/src/index.js",
      types: "./dist/src/index.d.ts",
      repository: {
        type: "git",
        url: "git+https://github.com/Unsupervisedcom/semlang.git",
      },
      publishConfig: { registry: "https://registry.npmjs.org/" },
    });
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.exports?.["."]).toMatchObject({
      types: "./dist/src/index.d.ts",
      import: "./dist/src/index.js",
    });
    expect(packageJson.files).toEqual(expect.arrayContaining(["bin", "dist/src"]));
    expect(packageJson.scripts["build:release"]).toBe("npm run build && node scripts/obfuscate-dist.mjs");
    expect(packageJson.scripts.prepack).toBe("npm run build:release");
    expect(packageJson.devDependencies).toHaveProperty("js-confuser");
  });

  it("resolves runtime version surfaces from package metadata", async () => {
    // 07.01.006: runtime version surfaces must resolve package metadata instead
    // of carrying release-specific hardcoded source strings.
    const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const version = await execFileAsync("node", ["dist/src/cli.js", "--version"], { cwd: root });
    const cliSource = await fs.readFile(path.join(root, "src", "cli.ts"), "utf8");
    const mcpSource = await fs.readFile(path.join(root, "src", "mcp.ts"), "utf8");

    expect(version.stdout.trim()).toBe(packageJson.version);
    expect(cliSource).toContain("getSemLangVersion()");
    expect(mcpSource).toContain("getSemLangVersion()");
    expect(cliSource).not.toMatch(/\.version\("[0-9]+\.[0-9]+\.[0-9]+"\)/);
    expect(mcpSource).not.toMatch(/version: "[0-9]+\.[0-9]+\.[0-9]+"/);
  });

  it("publishes to npm only after GitHub releases are published", async () => {
    // 07.02.001, 07.02.002, 07.02.003, 07.02.004, 07.02.005: release
    // automation must validate first, use the npm token secret, and publish
    // the obfuscated npm pack output with provenance.
    const workflow = await fs.readFile(path.join(root, ".github/workflows/release.yml"), "utf8");

    expect(workflow).toContain("release:");
    expect(workflow).toContain("published");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("registry-url: https://registry.npmjs.org/");
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm publish --provenance");
    expect(workflow).toContain("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}");
  });

  it("obfuscates release JavaScript while preserving Node execution", async () => {
    // 07.01.005: the release obfuscation step must run against Node-targeted
    // JavaScript without using fragile runtime locks.
    const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-obfuscate-"));
    const fixturePath = path.join(fixtureDir, "sample.js");
    await fs.writeFile(path.join(fixtureDir, "package.json"), '{"type":"module"}\n');
    await fs.writeFile(
      fixturePath,
      [
        "export class PublicClient {",
        "  externalMethod(value) {",
        '    const readableMethodLocal = "client";',
        "    return `${readableMethodLocal}:${value}`;",
        "  }",
        "}",
        "export const publicSurface = {",
        "  externalMethod(value) {",
        '    const readableObjectLocal = "surface";',
        "    return `${readableObjectLocal}:${value}`;",
        "  },",
        "};",
        "export function computeReleaseValue(input) {",
        '  const readableInternalName = "semlang-release";',
        "  return `${readableInternalName}:${input + 1}`;",
        "}",
        "",
      ].join("\n"),
    );

    await execFileAsync("node", ["scripts/obfuscate-dist.mjs", fixtureDir], { cwd: root });

    const obfuscated = await fs.readFile(fixturePath, "utf8");
    expect(obfuscated).not.toContain("readableInternalName");
    expect(obfuscated).not.toContain("readableMethodLocal");
    expect(obfuscated).not.toContain("readableObjectLocal");

    const fixtureUrl = pathToFileURL(fixturePath);
    fixtureUrl.searchParams.set("t", String(Date.now()));
    const imported = await import(fixtureUrl.href);
    expect(imported.computeReleaseValue(41)).toBe("semlang-release:42");
    expect(new imported.PublicClient().externalMethod("ok")).toBe("client:ok");
    expect(imported.publicSurface.externalMethod("ok")).toBe("surface:ok");
  });

  it("preserves shebang-only JavaScript files during release obfuscation", async () => {
    // 07.01.005: the release obfuscation step must preserve CLI shebangs even
    // when a tiny generated JavaScript file has no trailing newline.
    const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-obfuscate-shebang-"));
    const fixturePath = path.join(fixtureDir, "sample.js");
    await fs.writeFile(fixturePath, "#!/usr/bin/env node");

    await execFileAsync("node", ["scripts/obfuscate-dist.mjs", fixtureDir], { cwd: root });

    expect(await fs.readFile(fixturePath, "utf8")).toBe("#!/usr/bin/env node\n");
  });
});
