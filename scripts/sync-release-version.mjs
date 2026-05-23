#!/usr/bin/env node
/*
 * Purpose: Synchronizes release-version metadata before publishing the npm package.
 * Encapsulation: Keep release-time version rewrites here; runtime version lookup belongs in src/version.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const versionArg = args.find((arg) => !arg.startsWith("--"));
const rootArg = args.find((arg) => arg.startsWith("--root="));
const root = path.resolve(rootArg ? rootArg.slice("--root=".length) : path.resolve(import.meta.dirname, ".."));
const version = normalizeVersion(versionArg ?? process.env.SEMLANG_RELEASE_VERSION ?? process.env.GITHUB_REF_NAME);

if (!version) {
  throw new Error("Usage: node scripts/sync-release-version.mjs <version|vversion> [--root=<path>]");
}

await updateJson("package.json", (packageJson) => {
  packageJson.version = version;
});

await updateJson("package-lock.json", (lockfile) => {
  lockfile.version = version;
  if (lockfile.packages?.[""]) lockfile.packages[""].version = version;
});

await updateJson(path.join(".claude-plugin", "plugin.json"), (pluginJson) => {
  pluginJson.version = version;
});

await updateJson(".mcp.json", (mcpJson) => {
  const server = mcpJson.mcpServers?.semlang;
  if (!server) throw new Error(".mcp.json is missing mcpServers.semlang.");
  server.command = "npx";
  server.args = ["-y", `semlang@${version}`, "mcp"];
});

console.log(`Synchronized SemLang release metadata to ${version}.`);

function normalizeVersion(rawVersion) {
  if (!rawVersion) return undefined;
  const version = rawVersion.startsWith("v") ? rawVersion.slice(1) : rawVersion;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid SemLang release version: ${rawVersion}`);
  }
  return version;
}

async function updateJson(relativePath, update) {
  const filePath = path.join(root, relativePath);
  const value = JSON.parse(await fs.readFile(filePath, "utf8"));
  update(value);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
