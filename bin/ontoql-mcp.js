#!/usr/bin/env node
import { runOntoqlMcpStdioServer } from "../dist/src/mcp.js";

runOntoqlMcpStdioServer().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
