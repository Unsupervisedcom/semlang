/*
 * Purpose: Resolves the SemLang package version from package metadata.
 * Encapsulation: Keep release version lookup here so CLI and MCP surfaces do not hardcode npm versions.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface PackageMetadata {
  name?: unknown;
  version?: unknown;
}

let cachedVersion: string | undefined;

export function getSemLangVersion(): string {
  if (cachedVersion) return cachedVersion;

  const packageJsonPath = resolvePackageJsonPath();
  const packageJson = readPackageMetadata(packageJsonPath);
  if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
    throw new Error(`Unable to resolve SemLang package version from ${packageJsonPath}.`);
  }

  cachedVersion = packageJson.version;
  return cachedVersion;
}

function resolvePackageJsonPath(): string {
  const candidates = [
    process.env.SEMLANG_REPO_ROOT ? path.join(process.env.SEMLANG_REPO_ROOT, "package.json") : undefined,
    ...ancestorPackageJsonPaths(path.dirname(fileURLToPath(import.meta.url))),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const packageJson = readPackageMetadata(candidate);
    if (packageJson.name === "semlang") return candidate;
  }

  throw new Error("Unable to find SemLang package metadata.");
}

function ancestorPackageJsonPaths(startDir: string): string[] {
  const candidates: string[] = [];
  let current = startDir;
  while (true) {
    candidates.push(path.join(current, "package.json"));
    const parent = path.dirname(current);
    if (parent === current) return candidates;
    current = parent;
  }
}

function readPackageMetadata(packageJsonPath: string): PackageMetadata {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageMetadata;
}
