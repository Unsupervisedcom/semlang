/*
 * Purpose: Starts the SemLang MCP server over stdio for the standalone MCP binary.
 * Encapsulation: Keep this as a tiny process entry point; server construction and settings resolution belong in src/semlang-runtime.ts.
 */

import { runSemLangMcpStdioServerWithSettings } from "./semlang-runtime.js";

runSemLangMcpStdioServerWithSettings().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
