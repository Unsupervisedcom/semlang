/*
 * Purpose: Owns SemLang field statistics cache path resolution and project-local cache directory setup.
 * Encapsulation: Keep filesystem layout and .gitignore hygiene for stats caches out of MCP tool orchestration.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface FieldStatsCacheOptions {
  projectDir: string;
  statsCacheDirectory?: string;
}

export function resolveFieldStatsCacheDirectory(options: FieldStatsCacheOptions): string {
  return path.join(fieldStatsCacheRoot(options), "field-stats", "v1");
}

export async function prepareFieldStatsCacheDirectory(options: FieldStatsCacheOptions): Promise<string> {
  const cacheDirectory = resolveFieldStatsCacheDirectory(options);
  if (!options.statsCacheDirectory) await ensureProjectSemLangGitignore(options.projectDir);
  await fs.mkdir(cacheDirectory, { recursive: true });
  return cacheDirectory;
}

function fieldStatsCacheRoot(options: FieldStatsCacheOptions): string {
  return options.statsCacheDirectory ?? path.join(options.projectDir, ".semlang", "cache");
}

async function ensureProjectSemLangGitignore(projectDir: string): Promise<void> {
  const semlangDir = path.join(projectDir, ".semlang");
  const gitignorePath = path.join(semlangDir, ".gitignore");
  await fs.mkdir(semlangDir, { recursive: true });
  let current = "";
  try {
    current = await fs.readFile(gitignorePath, "utf8");
  } catch {
    // Missing .gitignore is normal for first cache setup.
  }
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes("cache/")) return;
  const next = current.trim() ? `${current.replace(/\s*$/, "\n")}cache/\n` : "cache/\n";
  await fs.writeFile(gitignorePath, next);
}
