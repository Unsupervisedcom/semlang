/*
 * Purpose: Resolves SemLang MCP settings, project paths, and Malloy execution context discovery.
 * Encapsulation: Keep MCP configuration and path discovery here; tool orchestration belongs in src/mcp.ts.
 */

import os from "node:os";
import path from "node:path";
import { discoverMalloyConfigPath } from "./malloy-execution.js";
import { resolveOptionalPath } from "./mcp-utils.js";

export interface SemLangMcpSettings {
  projectDir: string;
  malloyConfigPath?: string;
  exportDirectory: string;
}

export type ResolvedMalloyExecutionContext =
  | { ok: true; projectDir: string; malloyConfigPath: string; source: "explicit" | "discovered" }
  | { ok: false; error: string };

export function resolveSemLangMcpSettings(settings: Partial<SemLangMcpSettings> = {}): SemLangMcpSettings {
  const projectDir = resolveOptionalPath(settings.projectDir ?? envSetting("PROJECT_DIR")) ?? process.cwd();
  const malloyConfigPath = resolveOptionalPath(settings.malloyConfigPath ?? envSetting("MALLOY_CONFIG_PATH"));
  return {
    projectDir,
    malloyConfigPath,
    exportDirectory: resolveOptionalPath(settings.exportDirectory ?? envSetting("EXPORT_DIRECTORY")) ?? os.tmpdir(),
  };
}

/**
 * Looks up a managed SemLang setting by suffix, supporting conventional
 * uppercase `SEMLANG_*` env vars and lowercase `semlang_*` variants.
 */
export function envSetting(name: string): string | undefined {
  return process.env[`SEMLANG_${name}`] ?? process.env[`semlang_${name.toLowerCase()}`];
}

export async function resolveMalloyExecutionContext(
  explicitProjectDir: string | undefined,
  malloyConfigPath: string | undefined,
  sourcePaths: string[],
  modelFiles: string[] = [],
): Promise<ResolvedMalloyExecutionContext> {
  if (malloyConfigPath) {
    const resolvedConfigPath = path.resolve(malloyConfigPath);
    return {
      ok: true,
      projectDir: explicitProjectDir ? path.resolve(explicitProjectDir) : path.dirname(resolvedConfigPath),
      malloyConfigPath: resolvedConfigPath,
      source: "explicit",
    };
  }

  const startDir = inferConfigSearchStartDir(sourcePaths, modelFiles);
  const ceilingDir = explicitProjectDir ? path.resolve(explicitProjectDir) : path.parse(startDir).root;
  const discovered = await discoverMalloyConfigPath(startDir, ceilingDir);
  if (discovered) {
    return {
      ok: true,
      projectDir: explicitProjectDir ? path.resolve(explicitProjectDir) : path.dirname(discovered),
      malloyConfigPath: discovered,
      source: "discovered",
    };
  }

  return {
    ok: false,
    error: [
      "No Malloy config file was found for load_ontology.",
      "Pass configPath or malloyConfigPath explicitly, or add malloy-config-local.json or malloy-config.json at or above the SemLang model directory.",
      `Searched from ${startDir} up to ${ceilingDir}.`,
    ].join(" "),
  };
}

export function inferProjectDir(
  sourcePaths: string[] = [],
  modelFiles: string[] = [],
  malloyConfigPath?: string,
): string {
  const candidates = [...sourcePaths, ...modelFiles].filter(isRealMcpSourcePath).map((item) => path.resolve(item));
  if (candidates.length > 0) return commonDirectory(candidates.map((item) => path.dirname(item)));
  if (malloyConfigPath) return path.dirname(path.resolve(malloyConfigPath));
  return process.cwd();
}

export function inferConfigSearchStartDir(sourcePaths: string[] = [], modelFiles: string[] = []): string {
  const candidates = [...sourcePaths, ...modelFiles].filter(isRealMcpSourcePath).map((item) => path.resolve(item));
  if (candidates.length > 0) return commonDirectory(candidates.map((item) => path.dirname(item)));
  return process.cwd();
}

export function projectDirDiscoveryCeiling(
  sourcePaths: string[] = [],
  modelFiles: string[] = [],
  requestedProjectDir: string | undefined,
  managedProjectDir: string,
): string | undefined {
  if (requestedProjectDir) return requestedProjectDir;
  const startDir = inferConfigSearchStartDir(sourcePaths, modelFiles);
  const resolvedManagedProjectDir = path.resolve(managedProjectDir);
  return pathWithinOrEqual(startDir, resolvedManagedProjectDir) ? resolvedManagedProjectDir : undefined;
}

export function pathWithinOrEqual(child: string, ancestor: string): boolean {
  const relative = path.relative(path.resolve(ancestor), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function commonDirectory(dirs: string[]): string {
  if (dirs.length === 0) return process.cwd();
  const [first, ...rest] = dirs.map((dir) => path.resolve(dir).split(path.sep).filter(Boolean));
  if (!first) return process.cwd();
  const common = [...first];
  for (const dir of rest) {
    let index = 0;
    while (index < common.length && common[index] === dir[index]) index += 1;
    common.length = index;
  }
  const root = path.parse(path.resolve(dirs[0]!)).root;
  return path.join(root, ...common);
}

export function isSyntheticMcpPath(filePath: string): boolean {
  return filePath.includes("__semlang_mcp_inline__") || filePath.includes("__semlang_mcp_context__");
}

function isRealMcpSourcePath(filePath: string | undefined): filePath is string {
  return typeof filePath === "string" && filePath.length > 0 && !isSyntheticMcpPath(filePath);
}
