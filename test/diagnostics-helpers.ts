/*
 * Purpose: Shares diagnostic assertion helpers across diagnostics test files.
 * Encapsulation: Keep test-only diagnostic matching here; production diagnostic construction belongs in compiler phases.
 */

import { expect } from "vitest";
import type { Diagnostic } from "../src/types.js";

export function source(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function diagnostic(result: { diagnostics: Diagnostic[] }, code: string): Diagnostic {
  const found = result.diagnostics.find((item) => item.code === code);
  expect(found, `Expected diagnostic ${code}, got ${result.diagnostics.map((item) => item.code).join(", ")}`).toEqual(
    expect.objectContaining({ code }),
  );
  return found as Diagnostic;
}

export function expectDiagnostic(
  result: { diagnostics: Diagnostic[] },
  code: string,
  expected: { message: RegExp; line: number; column: number; file?: string },
) {
  expect(diagnostic(result, code)).toMatchObject({
    code,
    severity: "error",
    message: expect.stringMatching(expected.message),
    location: expected.file
      ? { file: expected.file, line: expected.line, column: expected.column }
      : { line: expected.line, column: expected.column },
  });
}

export function expectWarning(
  result: { diagnostics: Diagnostic[] },
  code: string,
  expected: { message: RegExp; line: number; column: number; file?: string },
) {
  expect(diagnostic(result, code)).toMatchObject({
    code,
    severity: "warning",
    message: expect.stringMatching(expected.message),
    location: expected.file
      ? { file: expected.file, line: expected.line, column: expected.column }
      : { line: expected.line, column: expected.column },
  });
}
