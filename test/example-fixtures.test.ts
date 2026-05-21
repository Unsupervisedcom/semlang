/*
 * Purpose: Confirms bundled domain example fixtures compile as maintained SemLang examples.
 * Encapsulation: Keep example fixture coverage here; detailed language behavior belongs in compiler and diagnostics tests.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileFile } from "../src/index.js";

const root = path.resolve(import.meta.dirname, "..");

const domains = [
  "banking-credit-risk-and-customer-exposure",
  "healthcare-patient-journey-and-quality-measures",
  "manufacturing-supply-chain-traceability-and-quality",
  "retail-omnichannel-margin-and-returns",
  "saas-product-usage-and-revenue",
] as const;

async function semlangExamplesForDomain(domain: string): Promise<string[]> {
  const domainDir = path.join(root, "examples", domain);
  const entries = await fs.readdir(domainDir);
  return entries
    .filter((entry) => /^example.*\.semlang$/.test(entry))
    .sort()
    .map((entry) => path.join(domainDir, entry));
}

describe("SemLang example fixtures", () => {
  it.each(domains)("compiles all %s examples", async (domain) => {
    const examples = await semlangExamplesForDomain(domain);
    expect(examples.length).toBeGreaterThan(0);

    const results = await Promise.all(
      examples.map(async (example) => ({
        example,
        result: await compileFile(example),
      })),
    );
    const diagnostics = results.flatMap(({ example, result }) =>
      result.diagnostics.map((diagnostic) => ({
        file: path.relative(root, example),
        ...diagnostic,
      })),
    );
    const missingMalloy = results
      .filter(({ result }) => !result.malloy)
      .map(({ example }) => path.relative(root, example));

    expect(diagnostics).toEqual([]);
    expect(missingMalloy).toEqual([]);
  });
});
