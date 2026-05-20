import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MalloyConfig, Runtime } from "@malloydata/malloy";
import type { LogMessage, URLReader } from "@malloydata/malloy";
import type { JsonValue } from "./mcp.js";
import type { Diagnostic } from "./types.js";

export interface MalloyExecutionContext {
  projectDir: string;
  malloyConfigPath?: string;
  malloyConfigSource?: "explicit" | "discovered";
  modelFilePath?: string;
}

export interface MalloyExecutionOptions {
  malloy: string;
  queryName: string;
  context: MalloyExecutionContext;
  rowLimit?: number;
}

export interface MalloyValidationOptions {
  malloy: string;
  context: MalloyExecutionContext;
}

export async function validateMalloyModel(options: MalloyValidationOptions): Promise<Diagnostic[]> {
  let runtime: Runtime | undefined;
  try {
    const created = await createMalloyRuntime(options.context);
    runtime = created.runtime;
    const model = await runtime.getModel(options.malloy, { noThrowOnError: true });
    return malloyProblemsToDiagnostics(model.problems);
  } catch (error) {
    const problems = malloyProblemsFromError(error);
    if (problems.length > 0) return malloyProblemsToDiagnostics(problems);
    return [{
      severity: "error",
      code: "MALLOY_VALIDATION_ERROR",
      message: `Malloy validation failed: ${error instanceof Error ? error.message : String(error)}`
    }];
  } finally {
    await runtime?.shutdown("close");
  }
}

export async function executeMalloyQuery(options: MalloyExecutionOptions): Promise<Record<string, JsonValue>> {
  let runtime: Runtime | undefined;
  let configSource: "explicit" | "discovered" | undefined;
  let configLog: JsonValue | undefined;
  let connectionTypes: string[] = [];
  try {
    const created = await createMalloyRuntime(options.context);
    runtime = created.runtime;
    configSource = created.configSource;
    configLog = created.configLog;
    connectionTypes = created.connectionTypes;
    const materializer = runtime.loadQueryByName(options.malloy, options.queryName);
    const sql = await materializer.getSQL();
    const result = await materializer.run(options.rowLimit === undefined ? undefined : { rowLimit: options.rowLimit });
    return {
      ok: true,
      engine: "malloy",
      queryName: options.queryName,
      sql,
      rows: result.data.toJSON() as JsonValue,
      totalRows: result.totalRows,
      malloyConfig: {
        source: configSource,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        connectionTypes,
        log: configLog
      }
    };
  } catch (error) {
    return {
      ok: false,
      engine: "malloy",
      queryName: options.queryName,
      error: error instanceof Error ? error.message : String(error),
      malloyConfig: {
        source: configSource ?? null,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        connectionTypes,
        log: configLog ?? []
      }
    };
  } finally {
    await runtime?.shutdown("close");
  }
}

async function createMalloyRuntime(context: MalloyExecutionContext): Promise<{
  runtime: Runtime;
  configSource: "explicit" | "discovered";
  configLog: JsonValue;
  connectionTypes: string[];
}> {
  const urlReader = new NodeFileURLReader();

  if (!context.malloyConfigPath) {
    throw new Error("No Malloy config path is available. Call set_ontology_source with configPath/malloyConfigPath, or place malloy-config-local.json or malloy-config.json where it can be discovered.");
  }
  const configSource = context.malloyConfigSource ?? "explicit";
  const configURL = pathToFileURL(context.malloyConfigPath);
  const pojo = await readMalloyConfig(context.malloyConfigPath);
  const connectionTypes = configuredConnectionTypes(pojo);
  await registerConnectionTypes(connectionTypes);
  const config = new MalloyConfig(pojo, {
    configURL: configURL.toString(),
    rootDirectory: path.resolve(context.projectDir)
  });

  return {
    runtime: new Runtime({ config, urlReader }),
    configSource,
    configLog: config.log as unknown as JsonValue,
    connectionTypes
  };
}

const malloyConnectionPackages: Record<string, string> = {
  databricks: "@malloydata/db-databricks",
  duckdb: "@malloydata/db-duckdb/native"
};

const registeredConnectionTypes = new Set<string>();

async function registerConnectionTypes(types: string[]): Promise<void> {
  const uniqueTypes = [...new Set(types)];
  for (const type of uniqueTypes) {
    if (registeredConnectionTypes.has(type)) continue;
    const packageName = malloyConnectionPackages[type];
    if (!packageName) {
      throw new Error(
        `Malloy connection type "${type}" is configured, but SemLang MCP does not know which package registers it. ` +
        "Install and add the matching @malloydata/db-* package to src/malloy-execution.ts."
      );
    }
    try {
      await import(packageName);
      registeredConnectionTypes.add(type);
    } catch (error) {
      throw new Error(
        `Malloy connection type "${type}" requires package "${packageName}", but it could not be loaded: ` +
        `${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

async function readMalloyConfig(filePath: string): Promise<Record<string, unknown>> {
  const contents = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(contents) as unknown;
  if (!isRecord(parsed)) throw new Error(`Malloy config ${filePath} must contain a JSON object.`);
  return parsed;
}

function configuredConnectionTypes(config: Record<string, unknown>): string[] {
  const connections = isRecord(config.connections) ? config.connections : {};
  const explicitTypes = Object.values(connections).flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.is !== "string") return [];
    return entry.is;
  });
  return config.includeDefaultConnections === true ? [...explicitTypes, "duckdb"] : explicitTypes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function malloyProblemsFromError(error: unknown): LogMessage[] {
  if (!isRecord(error) || !Array.isArray(error.problems)) return [];
  return error.problems.filter(isMalloyProblem);
}

function isMalloyProblem(value: unknown): value is LogMessage {
  return isRecord(value) && typeof value.message === "string";
}

function malloyProblemsToDiagnostics(problems: LogMessage[]): Diagnostic[] {
  return actionableMalloyProblems(problems).map((problem) => ({
    severity: problem.severity === "warn" ? "warning" : "error",
    code: problem.severity === "warn" ? "MALLOY_VALIDATION_WARNING" : "MALLOY_VALIDATION_ERROR",
    message: malloyProblemMessage(problem),
    location: malloyProblemLocation(problem)
  }));
}

function actionableMalloyProblems(problems: LogMessage[]): LogMessage[] {
  const schemaUnavailable = problems.some((problem) => problem.code === "failed-to-fetch-table-schema");
  return problems.filter((problem) => {
    if (problem.code === "failed-to-fetch-table-schema") return false;
    if (schemaUnavailable && problem.code === "field-not-found") return false;
    if (problem.code === "invalid-sql-source") return true;
    if (problem.code === "syntax-error") return true;
    return problem.severity === "warn";
  });
}

function malloyProblemMessage(problem: LogMessage): string {
  const code = problem.code ? ` [${problem.code}]` : "";
  return `Malloy validation${code}: ${problem.message}`;
}

function malloyProblemLocation(problem: LogMessage): Diagnostic["location"] | undefined {
  const start = problem.at?.range?.start;
  if (!start) return undefined;
  return {
    file: malloyProblemFile(problem),
    line: start.line + 1,
    column: start.character + 1
  };
}

function malloyProblemFile(problem: LogMessage): string | undefined {
  const url = problem.at?.url;
  if (!url) return undefined;
  return url === "internal://internal.malloy" ? "generated.malloy" : url;
}

export async function discoverMalloyConfigPath(startDir: string, ceilingDir?: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  const ceiling = ceilingDir ? path.resolve(ceilingDir) : path.parse(current).root;
  if (!isWithinOrEqualPath(current, ceiling)) return undefined;
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isWithinOrEqualPath(child: string, ancestor: string): boolean {
  const relative = path.relative(ancestor, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

class NodeFileURLReader implements URLReader {
  async readURL(url: URL): Promise<{ contents: string; invalidationKey: number }> {
    if (url.protocol !== "file:") throw new Error(`Only file URLs are supported by the SemLang Malloy URL reader: ${url.toString()}`);
    const filePath = fileURLToPath(url);
    const [contents, stats] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath)
    ]);
    return { contents, invalidationKey: stats.mtimeMs };
  }

  async getInvalidationKey(url: URL): Promise<number | null> {
    if (url.protocol !== "file:") return null;
    return (await fs.stat(fileURLToPath(url))).mtimeMs;
  }
}
