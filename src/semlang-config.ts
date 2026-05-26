/*
 * Purpose: Discovers, validates, resolves, and writes SemLang project configuration.
 * Encapsulation: Keep all .semlang/settings.yml, ontology entrypoint, Malloy config, and export path discovery here.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { pathWithinOrEqual } from "./mcp-utils.js";

export const semLangConfigDirectoryName = ".semlang";
export const semLangConfigFileName = "settings.yml";
export const semLangConfigRelativePath = path.join(semLangConfigDirectoryName, semLangConfigFileName);
export const defaultExportDirectory = `${semLangConfigDirectoryName}/exports`;

export interface SemLangConfig {
  ontology: {
    entrypoint: string;
  };
  malloy?: {
    configPath?: string;
  };
  exportDirectory?: string;
}

export interface ResolvedSemLangConfig {
  configPath: string;
  projectDir: string;
  config: SemLangConfig;
  ontologyPath: string;
  malloyConfigPath?: string;
  exportDirectory?: string;
}

export interface GenerateSemLangConfigOptions {
  cwd?: string;
  ontologyPath?: string;
  malloyConfigPath?: string;
  exportDirectory?: string;
}

export interface GeneratedSemLangConfig {
  configPath: string;
  projectDir: string;
  config: SemLangConfig;
  contents: string;
}

export type LoadSemLangConfigResult = { ok: true; resolved: ResolvedSemLangConfig } | { ok: false; error: string };

export async function loadSemLangConfig(startDir = process.cwd()): Promise<LoadSemLangConfigResult> {
  const configPath = await discoverSemLangConfigPath(startDir);
  if (!configPath) {
    return {
      ok: false,
      error: `No .semlang/settings.yml was found. Run "semlang setup" from your project directory to create one.`,
    };
  }

  try {
    return { ok: true, resolved: await readSemLangConfig(configPath) };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function discoverSemLangConfigPath(startDir = process.cwd()): Promise<string | undefined> {
  let current = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(current, semLangConfigRelativePath);
    if (await fileExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function readSemLangConfig(configPath: string): Promise<ResolvedSemLangConfig> {
  const resolvedConfigPath = path.resolve(configPath);
  const projectDir = path.dirname(path.dirname(resolvedConfigPath));
  const contents = await fs.readFile(resolvedConfigPath, "utf8");
  const parsed = parse(contents) as unknown;
  const config = validateSemLangConfig(parsed, resolvedConfigPath);
  const ontologyPath = resolveProjectPath(projectDir, config.ontology.entrypoint);
  const malloyConfigPath = config.malloy?.configPath
    ? resolveProjectPath(projectDir, config.malloy.configPath)
    : undefined;
  const exportDirectory = config.exportDirectory ? resolveProjectPath(projectDir, config.exportDirectory) : undefined;
  return {
    configPath: resolvedConfigPath,
    projectDir,
    config,
    ontologyPath,
    malloyConfigPath,
    exportDirectory,
  };
}

export async function generateSemLangConfig(
  options: GenerateSemLangConfigOptions = {},
): Promise<GeneratedSemLangConfig> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const existingConfigPath = await discoverSemLangConfigPath(cwd);
  const projectDir = existingConfigPath ? path.dirname(path.dirname(existingConfigPath)) : cwd;
  const configPath = existingConfigPath ?? path.join(projectDir, semLangConfigRelativePath);
  const ontologyPath = await setupOntologyPath(projectDir, options.ontologyPath);
  const malloyConfigPath = options.malloyConfigPath
    ? resolveProjectPath(projectDir, options.malloyConfigPath)
    : await discoverMalloyConfigPath(path.dirname(ontologyPath), projectDir);
  const exportDirectory = options.exportDirectory
    ? resolveProjectPath(projectDir, options.exportDirectory)
    : path.join(projectDir, defaultExportDirectory);
  const config: SemLangConfig = {
    ontology: {
      entrypoint: relativeProjectPath(projectDir, ontologyPath),
    },
  };
  if (malloyConfigPath) config.malloy = { configPath: relativeProjectPath(projectDir, malloyConfigPath) };
  config.exportDirectory = relativeProjectPath(projectDir, exportDirectory);
  return {
    configPath,
    projectDir,
    config,
    contents: semLangConfigToYaml(config),
  };
}

export async function writeSemLangConfig(
  generated: GeneratedSemLangConfig,
  options: { force?: boolean } = {},
): Promise<void> {
  if (!options.force && (await fileExists(generated.configPath))) {
    throw new Error(`SemLang config already exists at ${generated.configPath}. Pass --force to overwrite it.`);
  }
  await fs.mkdir(path.dirname(generated.configPath), { recursive: true });
  await fs.writeFile(generated.configPath, generated.contents);
}

export async function discoverMalloyConfigPath(startDir: string, ceilingDir?: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  const ceiling = ceilingDir ? path.resolve(ceilingDir) : path.parse(current).root;
  if (!pathWithinOrEqual(current, ceiling)) return undefined;
  for (;;) {
    const local = path.join(current, "malloy-config-local.json");
    const shared = path.join(current, "malloy-config.json");
    if (await fileExists(local)) return local;
    if (await fileExists(shared)) return shared;
    if (current === ceiling) return undefined;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function resolveProjectPath(projectDir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(projectDir, filePath);
}

export function semLangConfigToYaml(config: SemLangConfig): string {
  return stringify(config, { lineWidth: 0 });
}

export function defaultResolvedExportDirectory(resolvedConfig: ResolvedSemLangConfig | undefined): string {
  return resolvedConfig?.exportDirectory ?? os.tmpdir();
}

function validateSemLangConfig(value: unknown, configPath: string): SemLangConfig {
  if (!isRecord(value)) throw new Error(`SemLang config ${configPath} must contain a YAML object.`);
  const allowedTopLevel = new Set(["version", "ontology", "malloy", "exportDirectory"]);
  rejectUnknownKeys(value, allowedTopLevel, "SemLang config", configPath);
  if (value.version !== undefined && value.version !== 1) {
    throw new Error(`SemLang config ${configPath} version must be 1 when provided.`);
  }
  if (!isRecord(value.ontology)) {
    throw new Error(`SemLang config ${configPath} must define ontology.entrypoint.`);
  }
  rejectUnknownKeys(value.ontology, new Set(["entrypoint"]), "SemLang config ontology", configPath);
  if (typeof value.ontology.entrypoint !== "string" || value.ontology.entrypoint.length === 0) {
    throw new Error(`SemLang config ${configPath} ontology.entrypoint must be a non-empty string.`);
  }
  let malloy: SemLangConfig["malloy"];
  if (value.malloy !== undefined) {
    if (!isRecord(value.malloy)) throw new Error(`SemLang config ${configPath} malloy must be an object.`);
    rejectUnknownKeys(value.malloy, new Set(["configPath"]), "SemLang config malloy", configPath);
    if (value.malloy.configPath !== undefined && typeof value.malloy.configPath !== "string") {
      throw new Error(`SemLang config ${configPath} malloy.configPath must be a string.`);
    }
    malloy = value.malloy.configPath ? { configPath: value.malloy.configPath } : undefined;
  }
  if (value.exportDirectory !== undefined && typeof value.exportDirectory !== "string") {
    throw new Error(`SemLang config ${configPath} exportDirectory must be a string.`);
  }
  return {
    ontology: {
      entrypoint: value.ontology.entrypoint,
    },
    ...(malloy ? { malloy } : {}),
    ...(typeof value.exportDirectory === "string" ? { exportDirectory: value.exportDirectory } : {}),
  };
}

async function setupOntologyPath(projectDir: string, requestedPath: string | undefined): Promise<string> {
  if (requestedPath) {
    const resolvedPath = path.resolve(projectDir, requestedPath);
    if (!(await fileExists(resolvedPath))) {
      throw new Error(`Ontology entrypoint ${resolvedPath} does not exist.`);
    }
    return resolvedPath;
  }

  for (const candidate of ["model.semlang", "semlang.semlang", path.join("models", "model.semlang")]) {
    const candidatePath = path.join(projectDir, candidate);
    if (await fileExists(candidatePath)) return candidatePath;
  }

  const candidates = await shallowSemLangFiles(projectDir);
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length > 1) {
    throw new Error(
      [
        "Could not choose a SemLang ontology entrypoint because multiple candidates were found.",
        `Candidates: ${candidates.map((item) => relativeProjectPath(projectDir, item)).join(", ")}.`,
        "Pass --path <file> to choose one.",
      ].join(" "),
    );
  }
  throw new Error("Could not find a SemLang ontology entrypoint. Pass --path <file> to choose one.");
}

async function shallowSemLangFiles(projectDir: string): Promise<string[]> {
  const candidates: string[] = [];
  const ignoredDirectories = new Set([".git", semLangConfigDirectoryName, "dist", "node_modules"]);
  const entries = await fs.readdir(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(projectDir, entry.name);
    if (entry.isFile() && entry.name.endsWith(".semlang")) candidates.push(entryPath);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      const childEntries = await fs.readdir(entryPath, { withFileTypes: true }).catch(() => []);
      for (const child of childEntries) {
        if (child.isFile() && child.name.endsWith(".semlang")) candidates.push(path.join(entryPath, child.name));
      }
    }
  }
  return candidates.sort();
}

function relativeProjectPath(projectDir: string, filePath: string): string {
  const relative = path.relative(projectDir, path.resolve(filePath));
  return relative === "" ? "." : relative.split(path.sep).join("/");
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  configPath: string,
): void {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} ${configPath} has unknown key ${unknown[0]}.`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
