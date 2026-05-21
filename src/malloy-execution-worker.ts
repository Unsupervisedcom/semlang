import { parentPort, workerData } from "node:worker_threads";
import { executeMalloyQueryDirect } from "./malloy-execution.js";
import type { MalloyExecutionOptions } from "./malloy-execution.js";

try {
  const result = await executeMalloyQueryDirect(workerData as MalloyExecutionOptions);
  parentPort?.postMessage({ type: "result", result });
} catch (error) {
  parentPort?.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) });
}
