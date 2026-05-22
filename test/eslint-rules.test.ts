/*
 * Purpose: Verifies repository-specific ESLint rules.
 * Encapsulation: Keep local lint policy coverage here; feature and compiler tests own runtime behavior assertions.
 */

import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import maxTestsPerFile from "../eslint-rules/max-tests-per-file.js";

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
});
