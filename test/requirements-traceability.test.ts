import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const requirementIdPattern = /\b\d{2}\.\d{2}\.\d{3}\b/g;
const commentPattern = /\/\*[\s\S]*?\*\/|\/\/.*$/gm;

async function filesIn(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries
    .filter(predicate)
    .map((entry) => path.join(dir, entry))
    .sort();
}

function idsIn(text: string): Set<string> {
  return new Set(text.match(requirementIdPattern) ?? []);
}

function commentsIn(text: string): string {
  return (text.match(commentPattern) ?? []).join("\n");
}

describe("requirements traceability", () => {
  it("keeps every requirement ID referenced from test comments", async () => {
    const requirementFiles = await filesIn(path.join(root, "requirements"), (name) => /^REQ-\d+-.+\.md$/.test(name));
    const testFiles = await filesIn(
      path.join(root, "test"),
      (name) => /\.test\.ts$/.test(name) && name !== "requirements-traceability.test.ts",
    );

    const requirementIds = new Set<string>();
    for (const file of requirementFiles) {
      for (const id of idsIn(await fs.readFile(file, "utf8"))) requirementIds.add(id);
    }

    const commentedTestIds = new Set<string>();
    for (const file of testFiles) {
      for (const id of idsIn(commentsIn(await fs.readFile(file, "utf8")))) commentedTestIds.add(id);
    }

    const missing = [...requirementIds].filter((id) => !commentedTestIds.has(id)).sort();
    const stale = [...commentedTestIds].filter((id) => !requirementIds.has(id)).sort();

    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });
});
