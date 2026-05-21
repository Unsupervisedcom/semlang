/*
 * Purpose: Runs Malloy query or SQL execution inside a worker thread for timeout isolation.
 * Encapsulation: Keep worker message bridging here; execution implementation should stay in src/malloy-execution.ts.
 */

import { parentPort, workerData } from "node:worker_threads";
import { executeMalloyQueryDirect, executeMalloySqlDirect } from "./malloy-execution.js";
import type {
  MalloyExecutionOptions,
  MalloyExecutionWorkerData,
  MalloySqlExecutionOptions,
} from "./malloy-execution.js";
import type { JsonValue } from "./mcp.js";

try {
  const payload = workerData as MalloyExecutionWorkerData;
  let result: Record<string, JsonValue>;
  if (isWorkerQueryData(payload)) {
    result = await executeMalloyQueryDirect(payload.options);
  } else if (isWorkerSqlData(payload)) {
    result = await executeMalloySqlDirect(payload.options);
  } else {
    result = await executeMalloyQueryDirect(payload as MalloyExecutionOptions);
  }
  parentPort?.postMessage({ type: "result", result });
} catch (error) {
  parentPort?.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) });
}

function isWorkerQueryData(
  value: MalloyExecutionWorkerData,
): value is { kind: "query"; options: MalloyExecutionOptions } {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "query";
}

function isWorkerSqlData(
  value: MalloyExecutionWorkerData,
): value is { kind: "sql"; options: MalloySqlExecutionOptions } {
  return typeof value === "object" && value !== null && "kind" in value && value.kind === "sql";
}
