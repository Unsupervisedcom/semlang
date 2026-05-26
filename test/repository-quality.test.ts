/*
 * Purpose: Verifies repository automation that keeps local development worktrees usable.
 * Encapsulation: Keep Git hook behavior checks here; package distribution checks belong in packaging tests.
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

async function createHookFixture(): Promise<{ dir: string; npmLog: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-hooks-"));
  const binDir = path.join(dir, "bin");
  const npmLog = path.join(dir, "npm.log");

  await fs.mkdir(path.join(dir, ".husky"), { recursive: true });
  await fs.mkdir(path.join(dir, "docs-site"), { recursive: true });
  await fs.mkdir(binDir);
  await fs.copyFile(path.join(root, ".husky", "post-checkout"), path.join(dir, ".husky", "post-checkout"));
  await fs.copyFile(path.join(root, ".husky", "post-merge"), path.join(dir, ".husky", "post-merge"));
  await fs.copyFile(
    path.join(root, ".husky", "npm-install-if-needed"),
    path.join(dir, ".husky", "npm-install-if-needed"),
  );
  await fs.writeFile(path.join(dir, "package-lock.json"), "{}\n");
  await fs.writeFile(path.join(dir, "docs-site", "package-lock.json"), "{}\n");
  await fs.writeFile(
    path.join(binDir, "npm"),
    ["#!/usr/bin/env sh", 'printf "%s\\n" "$*" >> "$NPM_LOG"', ""].join("\n"),
    { mode: 0o755 },
  );

  return { dir, npmLog };
}

async function runHook(fixture: { dir: string; npmLog: string }, hook: string, args: string[]): Promise<string[]> {
  await execFileAsync("sh", [path.join(".husky", hook), ...args], {
    cwd: fixture.dir,
    env: {
      ...process.env,
      NPM_LOG: fixture.npmLog,
      PATH: `${path.join(fixture.dir, "bin")}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });

  return (await fs.readFile(fixture.npmLog, "utf8")).trim().split("\n");
}

describe("repository worktree hooks", () => {
  it("repairs missing npm dependencies on ordinary checkouts", async () => {
    // 00.03.001: checkout hooks must run the idempotent npm dependency setup
    // check even when the checkout refs do not imply a lockfile change.
    const fixture = await createHookFixture();

    const npmCalls = await runHook(fixture, "post-checkout", [
      "1111111111111111111111111111111111111111",
      "2222222222222222222222222222222222222222",
      "1",
    ]);

    expect(npmCalls).toEqual(["install", "--prefix docs-site install"]);
  });

  it("repairs missing npm dependencies after merges", async () => {
    // 00.03.001: merge hooks must run the same idempotent setup check so a
    // worktree can self-heal when dependencies are absent but lockfiles match.
    const fixture = await createHookFixture();

    const npmCalls = await runHook(fixture, "post-merge", ["0"]);

    expect(npmCalls).toEqual(["install", "--prefix docs-site install"]);
  });
});
