#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const binPath = fs.realpathSync(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(path.dirname(binPath), "..");
const tsxLoaderPath = path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs");
const sourceEntryPath = path.join(repoRoot, "src", "cli.ts");
const builtEntryPath = path.join(repoRoot, "dist", "src", "cli.js");

const cliArgs = ["mcp", ...process.argv.slice(2)];
const args =
  fs.existsSync(tsxLoaderPath) && fs.existsSync(sourceEntryPath)
    ? ["--import", pathToFileURL(tsxLoaderPath).href, sourceEntryPath, ...cliArgs]
    : [builtEntryPath, ...cliArgs];

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    SEMLANG_REPO_ROOT: repoRoot,
  },
  stdio: "inherit",
});

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
