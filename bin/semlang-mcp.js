#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const binPath = fs.realpathSync(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(path.dirname(binPath), "..");
const tsxLoaderPath = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const entryPath = path.join(repoRoot, "src", "mcp-stdio.ts");

if (!fs.existsSync(tsxLoaderPath)) {
  console.error(`Cannot start semlang-mcp: ${tsxLoaderPath} is missing. Run npm install in ${repoRoot}.`);
  process.exit(1);
}

const child = spawn(
  process.execPath,
  ["--import", pathToFileURL(tsxLoaderPath).href, entryPath, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEMLANG_REPO_ROOT: repoRoot,
    },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
