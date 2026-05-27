/*
 * Purpose: Verifies repository-specific ESLint rules.
 * Encapsulation: Keep local lint policy coverage here; feature and compiler tests own runtime behavior assertions.
 */

import { RuleTester } from "eslint";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import maxTestsPerFile from "../eslint-rules/max-tests-per-file.js";

const root = path.resolve(import.meta.dirname, "..");
const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("local ESLint rules", () => {
  it("00.01.001 rejects test files with too many individual test definitions", () => {
    // 00.01.001: repository lint rejects oversized test files so the runner can parallelize across files.
    tester.run("max-tests-per-file", maxTestsPerFile, {
      valid: [
        {
          code: "import { it } from 'vitest'; it('a', () => {}); it.only('b', () => {});",
          options: [{ max: 2 }],
        },
        {
          code: "import { it } from 'vitest'; it.each([1, 2])('case %s', () => {});",
          options: [{ max: 1 }],
        },
      ],
      invalid: [
        {
          code: "import { test } from 'vitest'; test('a', () => {}); test.skip('b', () => {}); test.concurrent('c', () => {});",
          errors: [{ messageId: "tooManyTests" }],
          options: [{ max: 2 }],
        },
      ],
    });
  });

  it("00.02.001 configures a cyclomatic complexity gate", () => {
    // 00.02.001: repository lint must enforce a maximum function complexity.
    const eslintConfig = fs.readFileSync(path.join(root, "eslint.config.js"), "utf8");

    expect(eslintConfig).toContain('complexity: ["error", { max: 21 }]');
  });
});
