import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { testDuckDbExternalAccessConfig } from "../duckdb-config.js";

const root = path.resolve(import.meta.dirname, "../..");
export const execFileAsync = promisify(execFile);

async function createTempProjectDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix + "-"));
}

export async function tempExamplePath(domain: string, fileName = "example.semlang"): Promise<string> {
  const sourceDir = path.join(root, "examples", domain);
  const targetDir = await createTempProjectDir("semlang-mcp-" + domain);
  await fs.cp(sourceDir, targetDir, { recursive: true });
  await prepareExampleDuckDb(targetDir);
  await fs.writeFile(
    path.join(targetDir, "malloy-config.json"),
    JSON.stringify(duckDbMalloyConfig(targetDir), null, 2),
  );
  return path.join(targetDir, fileName);
}

async function prepareExampleDuckDb(projectDir: string): Promise<void> {
  const schemaPath = path.join(projectDir, "schema.sql");
  const samplePath = path.join(projectDir, "sample_data.sql");
  const [schema, sampleData] = await Promise.all([fs.readFile(schemaPath, "utf8"), fs.readFile(samplePath, "utf8")]);
  await execFileAsync("duckdb", [duckDbDatabasePath(projectDir), "-c", schema + "\n" + sampleData], {
    cwd: projectDir,
    maxBuffer: 10 * 1024 * 1024,
  });
}

export function duckDbDatabasePath(projectDir: string): string {
  return path.join(projectDir, "warehouse.duckdb");
}

export function duckDbMalloyConfig(projectDir: string): Record<string, unknown> {
  return {
    connections: {
      duckdb: {
        is: "duckdb",
        databasePath: duckDbDatabasePath(projectDir),
        workingDirectory: projectDir,
        ...testDuckDbExternalAccessConfig(),
        extensionDirectory: path.join(projectDir, ".duckdb-extensions"),
      },
    },
  };
}

export async function setInlineOntology(
  mcp: ReturnType<typeof createSemLangMcp>,
  source: string,
): Promise<Record<string, unknown>> {
  const projectDir = await writeTempProject({});
  await fs.writeFile(
    path.join(projectDir, "malloy-config.json"),
    JSON.stringify(duckDbMalloyConfig(projectDir), null, 2),
  );
  return mcp.tools.set_ontology_source({
    basePath: path.join(projectDir, "inline.semlang"),
    source,
  });
}

export async function writeTempProject(files: Record<string, string>): Promise<string> {
  const projectDir = await createTempProjectDir("semlang-mcp-project");
  await Promise.all(
    Object.entries(files).map(async ([name, contents]) => {
      const target = path.join(projectDir, name);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, contents);
    }),
  );
  return projectDir;
}

export function asObject(value: unknown): Record<string, unknown> {
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

export function records(value: unknown): Record<string, unknown>[] {
  return asArray(value).map(asObject);
}

export function names(value: unknown): string[] {
  return asArray(value).map((item) => (typeof item === "string" ? item : String(asObject(item).name)));
}

export function text(value: unknown): string {
  expect(typeof value).toBe("string");
  return value as string;
}

export function expectOk(value: Record<string, unknown>): void {
  expect(value.ok).toBe(true);
  const diagnostics = records(value.diagnostics ?? []);
  expect(diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
}

export function expectQuery(value: Record<string, unknown>, name: string, rootName: string): Record<string, unknown> {
  expectOk(value);
  const query = asObject(value.query);
  expect(query).toMatchObject({ name, root: rootName });
  return query;
}

export function pathResult(response: Record<string, unknown>, target: string): Record<string, unknown> {
  const result = records(response.results).find((candidate) => candidate.target === target);
  expect(result).toEqual(expect.objectContaining({ target }));
  const resolved = result as Record<string, unknown>;
  expect(records(resolved.paths).length).toBeGreaterThan(0);
  return resolved;
}
