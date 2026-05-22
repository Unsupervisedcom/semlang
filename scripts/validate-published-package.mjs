#!/usr/bin/env node
/*
 * Purpose: Smoke-tests the semlang package exactly as npm consumers install it.
 * Encapsulation: Keep registry/package validation here; local source validation belongs in tests.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const localPackageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const args = process.argv.slice(2);
const keepTemp = args.includes("--keep-temp") || process.env.SEMLANG_KEEP_PUBLISHED_SMOKE_TEMP === "1";
const packageSpec = packageSpecFromArg(args.find((arg) => arg !== "--keep-temp") ?? localPackageJson.version);
const expectedExactVersion = exactVersionFromSpec(packageSpec);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-published-smoke-"));
const fixturePath = path.join(tempDir, "smoke.semlang");
const smokeModulePath = path.join(tempDir, "smoke.mjs");

console.log(`Validating published package ${packageSpec} in ${tempDir}`);

try {
  await fs.writeFile(path.join(tempDir, "package.json"), '{"type":"module","private":true}\n');
  await fs.writeFile(fixturePath, smokeFixture());
  await fs.writeFile(smokeModulePath, smokeModule(expectedExactVersion));

  await exec("npm", ["install", "--no-audit", "--no-fund", packageSpec], { cwd: tempDir });
  await exec("node", [smokeModulePath], { cwd: tempDir });

  const cliVersion = await exec(
    "node",
    [path.join(tempDir, "node_modules", "semlang", "bin", "semlang.js"), "--version"],
    {
      cwd: tempDir,
    },
  );
  if (expectedExactVersion && cliVersion.stdout.trim() !== expectedExactVersion) {
    throw new Error(`Expected CLI version ${expectedExactVersion}, received ${cliVersion.stdout.trim()}`);
  }

  const cliCompile = await exec(
    "node",
    [path.join(tempDir, "node_modules", "semlang", "bin", "semlang.js"), "compile", fixturePath, "--emit", "malloy"],
    { cwd: tempDir },
  );
  assertIncludes(cliCompile.stdout, "query: customer_rollup is customers ->", "CLI compile output");

  console.log(`Published package ${packageSpec} passed import and CLI smoke tests.`);
} finally {
  if (keepTemp) {
    console.log(`Keeping smoke-test project at ${tempDir}`);
  } else {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function exec(command, args, options) {
  try {
    return await execFileAsync(command, args, {
      ...options,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`, { cause: error });
  }
}

function packageSpecFromArg(arg) {
  if (arg.startsWith("semlang@") || arg === "semlang") return arg;
  return `semlang@${arg}`;
}

function exactVersionFromSpec(spec) {
  const match = /^semlang@(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(spec);
  return match?.[1];
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} did not include ${JSON.stringify(expected)}.`);
  }
}

function smokeFixture() {
  return [
    "package smoke.published",
    "",
    "type: CustomerId is string {",
    "}",
    "",
    "concept Customer is kind from duckdb.table('customers') {",
    "  identity customer_id :: CustomerId",
    "  field:",
    "    name :: string",
    "  measure:",
    "    rows is count()",
    "}",
    "",
    "query: customer_rollup is Customer -> {",
    "  aggregate:",
    "    rows",
    "}",
    "",
  ].join("\n");
}

function smokeModule(expectedVersion) {
  return `
import { compileSemLang, parseSemLang } from "semlang";

const source = await import("node:fs/promises").then((fs) => fs.readFile("smoke.semlang", "utf8"));
const parsed = parseSemLang(source, { filePath: "smoke.semlang" });
if (parsed.diagnostics.length > 0) {
  throw new Error(\`parseSemLang reported diagnostics: \${JSON.stringify(parsed.diagnostics)}\`);
}

const result = await compileSemLang(source, { filePath: "smoke.semlang" });
if (result.diagnostics.length > 0) {
  throw new Error(\`compileSemLang reported diagnostics: \${JSON.stringify(result.diagnostics)}\`);
}
if (!result.malloy?.includes("query: customer_rollup is customers ->")) {
  throw new Error("compileSemLang did not produce the expected Malloy query.");
}
${expectedVersion ? `if (await cliVersion() !== "${expectedVersion}") throw new Error("Package CLI version mismatch from import smoke.");` : ""}

async function cliVersion() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)("node", ["node_modules/semlang/bin/semlang.js", "--version"]);
  return stdout.trim();
}
`;
}
