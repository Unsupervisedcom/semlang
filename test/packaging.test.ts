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
      bin: { semlang: "bin/semlang.js" },
      main: "./dist/src/index.js",
      types: "./dist/src/index.d.ts",
      repository: {
        type: "git",
        url: "git+https://github.com/Unsupervisedcom/semlang.git",
      },
      publishConfig: { registry: "https://registry.npmjs.org/", access: "public" },
    });
    expect(packageJson.private).not.toBe(true);
    expect(packageJson.exports?.["."]).toMatchObject({
      types: "./dist/src/index.d.ts",
      import: "./dist/src/index.js",
    });
    expect(packageJson.files).toEqual(
      expect.arrayContaining([".claude-plugin", ".mcp.json", "bin", "dist/src", "skills"]),
    );
    expect(packageJson.scripts["build:release"]).toBe("npm run build && node scripts/obfuscate-dist.mjs");
    expect(packageJson.scripts.prepack).toBe("npm run build:release");
    expect(packageJson.scripts["validate:published"]).toBe("node scripts/validate-published-package.mjs");
    expect(packageJson.devDependencies).toHaveProperty("js-confuser");
  });

  it("publishes a Claude Code plugin backed by npm-installed SemLang", async () => {
    // 07.04.001, 07.04.002, 07.04.003, 07.04.004, 07.04.005, 07.04.007: the
    // npm artifact must double as a Claude Code plugin with auto-discovered
    // skills and MCP server, including the PR review loop skill.
    const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
    const pluginJson = JSON.parse(await fs.readFile(path.join(root, ".claude-plugin", "plugin.json"), "utf8"));
    const mcpJson = JSON.parse(await fs.readFile(path.join(root, ".mcp.json"), "utf8"));

    expect(pluginJson).toMatchObject({
      name: "semlang",
      description: expect.stringContaining("SemLang"),
      version: packageJson.version,
    });
    expect(pluginJson).not.toHaveProperty("skills");
    expect(pluginJson).not.toHaveProperty("mcpServers");

    expect(mcpJson).toEqual({
      mcpServers: {
        semlang: {
          command: "npx",
          args: ["-y", `semlang@${packageJson.version}`, "mcp"],
        },
      },
    });

    const skillDirs = (await fs.readdir(path.join(root, "skills"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const skillTexts = await Promise.all(
      skillDirs.map(async (skillDir) => ({
        name: skillDir,
        text: await fs.readFile(path.join(root, "skills", skillDir, "SKILL.md"), "utf8"),
      })),
    );
    const semlangSkill = await fs.stat(path.join(root, "skills", "semlang", "SKILL.md"));
    const initialOntologySkillPath = path.join(root, "skills", "initial-ontology-creation", "SKILL.md");
    const initialOntologySkill = await fs.stat(initialOntologySkillPath);
    const initialOntologySkillText = await fs.readFile(initialOntologySkillPath, "utf8");
    const pullAndReviewSkillPath = path.join(root, "skills", "pull-and-review", "SKILL.md");
    const pullAndReviewSkill = await fs.stat(pullAndReviewSkillPath);
    const pullAndReviewSkillText = await fs.readFile(pullAndReviewSkillPath, "utf8");

    expect(semlangSkill.isFile()).toBe(true);
    expect(initialOntologySkill.isFile()).toBe(true);
    expect(pullAndReviewSkill.isFile()).toBe(true);
    expect(skillDirs).toEqual(expect.arrayContaining(["semlang", "initial-ontology-creation", "pull-and-review"]));
    expect(skillDirs.every((name) => /^[a-z0-9-]+$/.test(name))).toBe(true);
    for (const skill of skillTexts) {
      expect(skill.text).toContain(`name: ${skill.name}`);
    }
    expect(initialOntologySkillText).toContain("name: initial-ontology-creation");
    expect(pullAndReviewSkillText).toContain("name: pull-and-review");
    expect(pullAndReviewSkillText).toContain("@copilot");
    expect(pullAndReviewSkillText).toContain("Wait about 4 minutes");
  });

  it("synchronizes release versions across npm and Claude plugin metadata", async () => {
    // 07.02.007, 07.04.006: release metadata must be derived from the GitHub
    // release tag so npm package metadata, plugin metadata, lockfile metadata,
    // and MCP package specs cannot drift.
    const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-release-version-"));
    const releaseVersion = "9.8.7";

    await fs.cp(path.join(root, ".claude-plugin"), path.join(fixtureDir, ".claude-plugin"), { recursive: true });
    await fs.copyFile(path.join(root, ".mcp.json"), path.join(fixtureDir, ".mcp.json"));
    await fs.copyFile(path.join(root, "package.json"), path.join(fixtureDir, "package.json"));
    await fs.copyFile(path.join(root, "package-lock.json"), path.join(fixtureDir, "package-lock.json"));

    await execFileAsync("node", ["scripts/sync-release-version.mjs", `v${releaseVersion}`, `--root=${fixtureDir}`], {
      cwd: root,
    });

    const packageJson = JSON.parse(await fs.readFile(path.join(fixtureDir, "package.json"), "utf8"));
    const packageLock = JSON.parse(await fs.readFile(path.join(fixtureDir, "package-lock.json"), "utf8"));
    const pluginJson = JSON.parse(await fs.readFile(path.join(fixtureDir, ".claude-plugin", "plugin.json"), "utf8"));
    const mcpJson = JSON.parse(await fs.readFile(path.join(fixtureDir, ".mcp.json"), "utf8"));

    expect(packageJson.version).toBe(releaseVersion);
    expect(packageLock.version).toBe(releaseVersion);
    expect(packageLock.packages[""].version).toBe(releaseVersion);
    expect(pluginJson.version).toBe(releaseVersion);
    expect(mcpJson.mcpServers.semlang).toEqual({
      command: "npx",
      args: ["-y", `semlang@${releaseVersion}`, "mcp"],
    });
  });

  it("documents npm installation from the published package", async () => {
    // 07.03.001: npm consumers must be able to discover the published package
    // install path from the repository README.
    const readme = await fs.readFile(path.join(root, "README.md"), "utf8");

    expect(readme).toContain("npm install semlang");
    expect(readme).toContain('import { compileSemLang } from "semlang"');
    expect(readme).toContain("semlang compile");
    expect(readme).toContain("claude plugin install semlang@<marketplace-name>");
  });

  it("provides a reusable published package smoke-test utility", async () => {
    // 07.03.002, 07.03.003, 07.03.004: published package validation must
    // install from npm in isolation, cover library import and CLI behavior, and
    // clean up temporary projects unless debugging keeps them.
    const script = await fs.readFile(path.join(root, "scripts", "validate-published-package.mjs"), "utf8");

    expect(script).toContain("npm");
    expect(script).toContain("install");
    expect(script).toContain('import { compileSemLang, parseSemLang } from "semlang"');
    expect(script).toContain('bin", "semlang.js"');
    expect(script).toContain("compile");
    expect(script).toContain("--keep-temp");
    expect(script).toContain("SEMLANG_KEEP_PUBLISHED_SMOKE_TEMP");
    expect(script).toContain("fs.rm(tempDir, { recursive: true, force: true })");
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
    // 07.02.001, 07.02.002, 07.02.003, 07.02.004, 07.02.005,
    // 07.02.006, 07.02.007: release automation must synchronize release
    // metadata from the GitHub release tag, validate first, use the npm token
    // secret, and publish the obfuscated npm pack output with public npm
    // access.
    const workflow = await fs.readFile(path.join(root, ".github/workflows/release.yml"), "utf8");

    expect(workflow).toContain("release:");
    expect(workflow).toContain("published");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).toContain("registry-url: https://registry.npmjs.org/");
    expect(workflow).toContain('node scripts/sync-release-version.mjs "${GITHUB_REF_NAME}"');
    expect(workflow.indexOf("Sync release version")).toBeLessThan(workflow.indexOf("Install dependencies"));
    expect(workflow.indexOf("Sync release version")).toBeLessThan(workflow.indexOf("Run checks"));
    expect(workflow).toContain("npm run check");
    expect(workflow).toContain("npm publish --access public");
    expect(workflow).not.toContain("--provenance");
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
