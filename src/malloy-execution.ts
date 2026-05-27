/*
 * Purpose: Validates and executes generated Malloy models, queries, and SQL using Malloy runtimes and worker timeouts.
 * Encapsulation: Keep Malloy SDK integration, connection discovery, and execution diagnostics here; SemLang operation orchestration belongs in src/semlang-runtime.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { MalloyConfig, Runtime } from "@malloydata/malloy";
import type { LogMessage, URLReader } from "@malloydata/malloy";
import type { JsonValue } from "./mcp-utils.js";
import type { Diagnostic, GeneratedSourceContextLine, MalloySourceMapEntry } from "./types.js";

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
  queryLimitSeconds: number;
  rowLimit?: number;
}

export interface MalloySqlExecutionOptions {
  sql: string;
  connectionName: string;
  context: MalloyExecutionContext;
  queryLimitSeconds?: number;
  rowLimit?: number;
}

export interface MalloyValidationOptions {
  malloy: string;
  context: MalloyExecutionContext;
  sourceMap?: MalloySourceMapEntry[];
}

type WorkerMessage =
  | { type: "result"; result: Record<string, JsonValue> }
  | { type: "error"; error: string }
  | { type: string; result?: unknown; error?: unknown };

export type MalloyExecutionWorkerData =
  | { kind: "query"; options: MalloyExecutionOptions }
  | { kind: "sql"; options: MalloySqlExecutionOptions }
  | MalloyExecutionOptions;

export async function validateMalloyModel(options: MalloyValidationOptions): Promise<Diagnostic[]> {
  let runtime: Runtime | undefined;
  try {
    const created = await createMalloyRuntime(options.context);
    runtime = created.runtime;
    const model = await runtime.getModel(options.malloy, { noThrowOnError: true });
    return malloyProblemsToDiagnostics(model.problems, options.malloy, options.sourceMap);
  } catch (error) {
    const problems = malloyProblemsFromError(error);
    if (problems.length > 0) return malloyProblemsToDiagnostics(problems, options.malloy, options.sourceMap);
    return [
      {
        severity: "error",
        code: "MALLOY_VALIDATION_ERROR",
        message: `Malloy validation failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  } finally {
    await runtime?.shutdown("close");
  }
}

export async function executeMalloyQuery(options: MalloyExecutionOptions): Promise<Record<string, JsonValue>> {
  return executeMalloyQueryInWorker(options);
}

export async function executeMalloySql(options: MalloySqlExecutionOptions): Promise<Record<string, JsonValue>> {
  // Use a worker only when a timeout is configured so long-running SQL can be
  // hard-stopped; otherwise run directly to avoid worker overhead.
  if (options.queryLimitSeconds !== undefined)
    return executeMalloySqlInWorker({ ...options, queryLimitSeconds: options.queryLimitSeconds });
  return executeMalloySqlDirect(options);
}

export async function executeMalloySqlDirect(options: MalloySqlExecutionOptions): Promise<Record<string, JsonValue>> {
  const startedAt = Date.now();
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
    const connection = await runtime.connections.lookupConnection(options.connectionName);
    const result = await connection.runSQL(
      options.sql,
      options.rowLimit === undefined ? undefined : { rowLimit: options.rowLimit },
    );
    return {
      ok: true,
      engine: "malloy",
      connectionName: options.connectionName,
      query_limit_seconds: options.queryLimitSeconds ?? null,
      execution_time_ms: elapsedMs(startedAt),
      timed_out: false,
      sql: options.sql,
      rows: result.rows as JsonValue,
      totalRows: result.totalRows,
      malloyConfig: {
        source: configSource ?? null,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        connectionTypes,
        log: configLog ?? [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      engine: "malloy",
      connectionName: options.connectionName,
      query_limit_seconds: options.queryLimitSeconds ?? null,
      execution_time_ms: elapsedMs(startedAt),
      timed_out: false,
      sql: options.sql,
      error: error instanceof Error ? error.message : String(error),
      malloyConfig: {
        source: configSource ?? null,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        connectionTypes,
        log: configLog ?? [],
      },
    };
  } finally {
    await runtime?.shutdown("close");
  }
}

export async function executeMalloyQueryDirect(options: MalloyExecutionOptions): Promise<Record<string, JsonValue>> {
  const startedAt = Date.now();
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
      query_limit_seconds: options.queryLimitSeconds,
      execution_time_ms: elapsedMs(startedAt),
      timed_out: false,
      sql,
      rows: result.data.toJSON() as JsonValue,
      totalRows: result.totalRows,
      malloyConfig: {
        source: configSource ?? null,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        connectionTypes,
        log: configLog ?? [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      engine: "malloy",
      queryName: options.queryName,
      query_limit_seconds: options.queryLimitSeconds,
      execution_time_ms: elapsedMs(startedAt),
      timed_out: false,
      error: error instanceof Error ? error.message : String(error),
      malloyConfig: {
        source: configSource ?? null,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        connectionTypes,
        log: configLog ?? [],
      },
    };
  } finally {
    await runtime?.shutdown("close");
  }
}

async function executeMalloyQueryInWorker(options: MalloyExecutionOptions): Promise<Record<string, JsonValue>> {
  const startedAt = Date.now();
  const workerTarget = await malloyExecutionWorkerTarget();
  const worker = new Worker(workerTarget.url, {
    workerData: { kind: "query", options },
    execArgv: workerTarget.execArgv,
  });
  const limitMs = options.queryLimitSeconds * 1000;
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(timeoutResult(options, startedAt));
      void worker.terminate();
    }, limitMs);

    const finish = (result: Record<string, JsonValue>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ...result, execution_time_ms: elapsedMs(startedAt) });
    };

    worker.once("message", (message: WorkerMessage) => {
      if (isWorkerResultMessage(message)) {
        finish(message.result);
        return;
      }
      finish(
        workerErrorResult(
          options,
          startedAt,
          isWorkerErrorMessage(message) ? message.error : "Unexpected worker message.",
        ),
      );
    });

    worker.once("error", (error) => {
      finish(workerErrorResult(options, startedAt, error instanceof Error ? error.message : String(error)));
    });

    worker.once("exit", (code) => {
      if (!settled)
        finish(
          workerErrorResult(
            options,
            startedAt,
            `Malloy execution worker exited with code ${code} before returning a result.`,
          ),
        );
    });
  });
}

async function executeMalloySqlInWorker(
  options: MalloySqlExecutionOptions & { queryLimitSeconds: number },
): Promise<Record<string, JsonValue>> {
  const startedAt = Date.now();
  const workerTarget = await malloyExecutionWorkerTarget();
  const worker = new Worker(workerTarget.url, {
    workerData: { kind: "sql", options },
    execArgv: workerTarget.execArgv,
  });
  const limitMs = options.queryLimitSeconds * 1000;
  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(sqlTimeoutResult(options, startedAt));
      void worker.terminate();
    }, limitMs);

    const finish = (result: Record<string, JsonValue>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ...result, execution_time_ms: elapsedMs(startedAt) });
    };

    worker.once("message", (message: WorkerMessage) => {
      if (isWorkerResultMessage(message)) {
        finish(message.result);
        return;
      }
      finish(
        sqlWorkerErrorResult(
          options,
          startedAt,
          isWorkerErrorMessage(message) ? message.error : "Unexpected worker message.",
        ),
      );
    });

    worker.once("error", (error) => {
      finish(sqlWorkerErrorResult(options, startedAt, error instanceof Error ? error.message : String(error)));
    });

    worker.once("exit", (code) => {
      if (!settled)
        finish(
          sqlWorkerErrorResult(
            options,
            startedAt,
            `Malloy execution worker exited with code ${code} before returning a result.`,
          ),
        );
    });
  });
}

async function malloyExecutionWorkerTarget(): Promise<{ url: URL; execArgv?: string[] }> {
  const adjacent = new URL("./malloy-execution-worker.js", import.meta.url);
  if (await pathExists(fileURLToPath(adjacent))) return { url: adjacent };
  const source = new URL("./malloy-execution-worker.ts", import.meta.url);
  const sourceExecArgv = sourceWorkerExecArgv();
  if (sourceExecArgv && fileURLToPath(import.meta.url).endsWith(".ts") && (await pathExists(fileURLToPath(source)))) {
    return { url: source, execArgv: sourceExecArgv };
  }
  const built = pathToFileURL(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/src/malloy-execution-worker.js"),
  );
  if (await pathExists(fileURLToPath(built))) return { url: built };
  return { url: adjacent };
}

function sourceWorkerExecArgv(): string[] | undefined {
  return process.execArgv.some((arg) => arg.includes("tsx")) ? process.execArgv : undefined;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function timeoutResult(options: MalloyExecutionOptions, startedAt: number): Record<string, JsonValue> {
  return {
    ok: false,
    engine: "malloy",
    queryName: options.queryName,
    query_limit_seconds: options.queryLimitSeconds ?? null,
    execution_time_ms: elapsedMs(startedAt),
    timed_out: true,
    error: `Query ${options.queryName} exceeded query_limit_seconds=${options.queryLimitSeconds}.`,
    malloyConfig: {
      source: options.context.malloyConfigSource ?? null,
      projectDir: options.context.projectDir,
      path: options.context.malloyConfigPath ?? null,
      connectionTypes: [],
      log: [],
    },
  };
}

function workerErrorResult(
  options: MalloyExecutionOptions,
  startedAt: number,
  error: string,
): Record<string, JsonValue> {
  return {
    ok: false,
    engine: "malloy",
    queryName: options.queryName,
    query_limit_seconds: options.queryLimitSeconds ?? null,
    execution_time_ms: elapsedMs(startedAt),
    timed_out: false,
    error,
    malloyConfig: {
      source: options.context.malloyConfigSource ?? null,
      projectDir: options.context.projectDir,
      path: options.context.malloyConfigPath ?? null,
      connectionTypes: [],
      log: [],
    },
  };
}

function sqlTimeoutResult(options: MalloySqlExecutionOptions, startedAt: number): Record<string, JsonValue> {
  return {
    ok: false,
    engine: "malloy",
    connectionName: options.connectionName,
    query_limit_seconds: options.queryLimitSeconds ?? null,
    execution_time_ms: elapsedMs(startedAt),
    timed_out: true,
    sql: options.sql,
    error: `Statement exceeded query_limit_seconds=${options.queryLimitSeconds}.`,
    malloyConfig: {
      source: options.context.malloyConfigSource ?? null,
      projectDir: options.context.projectDir,
      path: options.context.malloyConfigPath ?? null,
      connectionTypes: [],
      log: [],
    },
  };
}

function sqlWorkerErrorResult(
  options: MalloySqlExecutionOptions,
  startedAt: number,
  error: string,
): Record<string, JsonValue> {
  return {
    ok: false,
    engine: "malloy",
    connectionName: options.connectionName,
    query_limit_seconds: options.queryLimitSeconds ?? null,
    execution_time_ms: elapsedMs(startedAt),
    timed_out: false,
    sql: options.sql,
    error,
    malloyConfig: {
      source: options.context.malloyConfigSource ?? null,
      projectDir: options.context.projectDir,
      path: options.context.malloyConfigPath ?? null,
      connectionTypes: [],
      log: [],
    },
  };
}

function isWorkerResultMessage(
  message: WorkerMessage,
): message is { type: "result"; result: Record<string, JsonValue> } {
  return message.type === "result" && isRecord(message.result);
}

function isWorkerErrorMessage(message: WorkerMessage): message is { type: "error"; error: string } {
  return message.type === "error" && typeof message.error === "string";
}

function elapsedMs(startedAt: number): number {
  return Date.now() - startedAt;
}

async function createMalloyRuntime(context: MalloyExecutionContext): Promise<{
  runtime: Runtime;
  configSource: "explicit" | "discovered";
  configLog: JsonValue;
  connectionTypes: string[];
}> {
  const urlReader = new NodeFileURLReader();

  if (!context.malloyConfigPath) {
    throw new Error(
      'No Malloy config path is available. Run "semlang setup --force" after adding malloy-config.json, add malloy.configPath to .semlang/settings.yml, or pass malloyConfigPath explicitly.',
    );
  }
  const configSource = context.malloyConfigSource ?? "explicit";
  const configURL = pathToFileURL(context.malloyConfigPath);
  const pojo = await readMalloyConfig(context.malloyConfigPath);
  const connectionTypes = configuredConnectionTypes(pojo);
  await registerConnectionTypes(connectionTypes);
  const config = new MalloyConfig(pojo, {
    configURL: configURL.toString(),
    rootDirectory: path.resolve(context.projectDir),
  });

  return {
    runtime: new Runtime({ config, urlReader }),
    configSource,
    configLog: config.log as unknown as JsonValue,
    connectionTypes,
  };
}

const malloyConnectionPackages: Record<string, string> = {
  databricks: "@malloydata/db-databricks",
  duckdb: "@malloydata/db-duckdb/native",
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
          "Install and add the matching @malloydata/db-* package to src/malloy-execution.ts.",
      );
    }
    try {
      await import(packageName);
      registeredConnectionTypes.add(type);
    } catch (error) {
      throw new Error(
        `Malloy connection type "${type}" requires package "${packageName}", but it could not be loaded: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
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

function malloyProblemsToDiagnostics(
  problems: LogMessage[],
  malloy: string,
  sourceMap: MalloySourceMapEntry[] | undefined,
): Diagnostic[] {
  return actionableMalloyProblems(problems).map((problem) => {
    const generatedLocation = malloyProblemLocation(problem);
    const mapped = generatedLocation?.line ? sourceMapEntryForLine(sourceMap, generatedLocation.line) : undefined;
    return {
      severity: problem.severity === "warn" ? "warning" : "error",
      code: problem.severity === "warn" ? "MALLOY_VALIDATION_WARNING" : "MALLOY_VALIDATION_ERROR",
      message: malloyProblemMessage(problem),
      location: mapped?.location ?? generatedLocation,
      generatedLocation,
      generatedContext: generatedLocation?.line ? malloyContextLines(malloy, generatedLocation.line) : undefined,
      sourceMapTarget: mapped ? { kind: mapped.kind, label: mapped.label } : undefined,
    };
  });
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
    column: start.character + 1,
  };
}

function malloyProblemFile(problem: LogMessage): string | undefined {
  const url = problem.at?.url;
  if (!url) return undefined;
  return url === "internal://internal.malloy" ? "generated.malloy" : url;
}

function sourceMapEntryForLine(
  sourceMap: MalloySourceMapEntry[] | undefined,
  line: number,
): MalloySourceMapEntry | undefined {
  if (!sourceMap || sourceMap.length === 0) return undefined;
  const exact = sourceMap.find((entry) => entry.generatedStartLine <= line && entry.generatedEndLine >= line);
  if (exact) return exact;
  const previous = sourceMap
    .filter((entry) => entry.generatedStartLine <= line)
    .sort((a, b) => b.generatedStartLine - a.generatedStartLine)[0];
  if (previous && line - previous.generatedEndLine <= 2) return previous;
  const next = sourceMap
    .filter((entry) => entry.generatedStartLine > line)
    .sort((a, b) => a.generatedStartLine - b.generatedStartLine)[0];
  if (next && next.generatedStartLine - line <= 2) return next;
  return undefined;
}

function malloyContextLines(malloy: string, problemLine: number): GeneratedSourceContextLine[] {
  const lines = malloy.split(/\r?\n/);
  const start = Math.max(1, problemLine - 2);
  const end = Math.min(lines.length, problemLine + 2);
  const context: GeneratedSourceContextLine[] = [];
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    context.push({
      line: lineNumber,
      text: lines[lineNumber - 1] ?? "",
      marker: lineNumber === problemLine ? "error" : undefined,
    });
  }
  return context;
}

class NodeFileURLReader implements URLReader {
  async readURL(url: URL): Promise<{ contents: string; invalidationKey: number }> {
    if (url.protocol !== "file:")
      throw new Error(`Only file URLs are supported by the SemLang Malloy URL reader: ${url.toString()}`);
    const filePath = fileURLToPath(url);
    const [contents, stats] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    return { contents, invalidationKey: stats.mtimeMs };
  }

  async getInvalidationKey(url: URL): Promise<number | null> {
    if (url.protocol !== "file:") return null;
    return (await fs.stat(fileURLToPath(url))).mtimeMs;
  }
}
