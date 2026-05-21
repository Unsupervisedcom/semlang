import { runSemLangMcpStdioServerWithSettings } from "./mcp.js";

runSemLangMcpStdioServerWithSettings().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
