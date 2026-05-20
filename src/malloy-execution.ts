import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "@malloydata/db-duckdb/native";
import { MalloyConfig, Runtime } from "@malloydata/malloy";
import type { URLReader } from "@malloydata/malloy";
import type { JsonValue } from "./mcp.js";

export interface MalloyExecutionContext {
  projectDir: string;
  malloyConfigPath?: string;
  modelFilePath?: string;
}

export interface MalloyExecutionOptions {
  malloy: string;
  queryName: string;
  context: MalloyExecutionContext;
  rowLimit?: number;
}

export async function executeMalloyQuery(options: MalloyExecutionOptions): Promise<Record<string, JsonValue>> {
  const { runtime, configSource, configLog } = await createMalloyRuntime(options.context);
  try {
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
        source: configSource,
        projectDir: options.context.projectDir,
        path: options.context.malloyConfigPath ?? null,
        log: configLog
      }
    };
  } finally {
    await runtime.shutdown("close");
  }
}

async function createMalloyRuntime(context: MalloyExecutionContext): Promise<{
  runtime: Runtime;
  configSource: "explicit" | "discovered" | "synthesized";
  configLog: JsonValue;
}> {
  const urlReader = new NodeFileURLReader();
  const projectURL = directoryFileURL(context.projectDir);

  let config: MalloyConfig | null = null;
  let configSource: "explicit" | "discovered" | "synthesized" = "synthesized";

  if (context.malloyConfigPath) {
    const configURL = pathToFileURL(context.malloyConfigPath);
    const contents = await fs.readFile(context.malloyConfigPath, "utf8");
    config = new MalloyConfig(contents, {
      configURL: configURL.toString(),
      rootDirectory: path.resolve(context.projectDir)
    });
    configSource = "explicit";
  } else {
    const discoveredPath = await discoverMalloyConfigPath(
      context.modelFilePath ? path.dirname(context.modelFilePath) : context.projectDir,
      context.projectDir
    );
    if (discoveredPath) {
      const contents = await fs.readFile(discoveredPath, "utf8");
      config = new MalloyConfig(contents, {
        configURL: pathToFileURL(discoveredPath).toString(),
        rootDirectory: path.resolve(context.projectDir)
      });
      configSource = "discovered";
    }
  }

  if (!config) {
    const duckDbScratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-mcp-malloy-duckdb-"));
    config = new MalloyConfig({
      includeDefaultConnections: true,
      connections: {
        duckdb: {
          is: "duckdb",
          workingDirectory: path.resolve(context.projectDir),
          extensionDirectory: path.join(duckDbScratchDir, "extensions")
        }
      }
    }, {
      configURL: new URL("malloy-config.json", projectURL).toString(),
      rootDirectory: path.resolve(context.projectDir)
    });
  }

  return {
    runtime: new Runtime({ config, urlReader }),
    configSource,
    configLog: config.log as unknown as JsonValue
  };
}

function directoryFileURL(dir: string): URL {
  const absolute = path.resolve(dir);
  const withTrailingSeparator = absolute.endsWith(path.sep) ? absolute : `${absolute}${path.sep}`;
  return pathToFileURL(withTrailingSeparator);
}

async function discoverMalloyConfigPath(startDir: string, ceilingDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  const ceiling = path.resolve(ceilingDir);
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
