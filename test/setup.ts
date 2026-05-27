/*
 * Purpose: Installs global test guards for accidental console and SemLang logger noise.
 * Encapsulation: Keep cross-test output policy here; individual tests can opt in to expected logs through test-log-sink helpers.
 */

import { afterEach, beforeEach } from "vitest";
import failOnConsole from "vitest-fail-on-console";
import { assertNoUnexpectedSemLangLogs, installSemLangTestLogger, resetSemLangTestLogs } from "./test-log-sink.js";

failOnConsole();
installSemLangTestLogger();

beforeEach(() => {
  resetSemLangTestLogs();
  installSemLangTestLogger();
});

afterEach(() => {
  assertNoUnexpectedSemLangLogs();
  installSemLangTestLogger();
});
