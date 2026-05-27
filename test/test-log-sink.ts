/*
 * Purpose: Captures SemLang pino logs during tests and fails on unexpected warning/error output.
 * Encapsulation: Keep test-only logging policy here; production logger setup belongs in src/logging.ts.
 */

import { configureSemLangLogger } from "../src/logging.js";

interface SemLangTestLog {
  level: number;
  message?: string;
  raw: string;
}

type SemLangTestLogPredicate = (log: SemLangTestLog) => boolean;

const failingLevel = 40;
const logs: SemLangTestLog[] = [];
const unexpectedLogs: SemLangTestLog[] = [];
const allowedLogs: SemLangTestLogPredicate[] = [];

const testLogSink = {
  write(message: string): void {
    for (const line of message.split("\n")) {
      const raw = line.trim();
      if (raw.length === 0) continue;
      const log = parseLog(raw);
      logs.push(log);
      if (log.level < failingLevel) continue;
      if (allowedLogs.some((allowed) => allowed(log))) continue;
      unexpectedLogs.push(log);
    }
  },
};

export function installSemLangTestLogger(): void {
  configureSemLangLogger({ destination: testLogSink, level: "debug" });
}

export function resetSemLangTestLogs(): void {
  logs.length = 0;
  unexpectedLogs.length = 0;
  allowedLogs.length = 0;
}

export function allowSemLangTestLogs(predicate: SemLangTestLogPredicate): void {
  allowedLogs.push(predicate);
}

export function semLangTestLogs(): SemLangTestLog[] {
  return [...logs];
}

export function assertNoUnexpectedSemLangLogs(): void {
  if (unexpectedLogs.length === 0) return;
  const details = unexpectedLogs.map((log) => log.raw).join("\n");
  throw new Error(`Unexpected SemLang warning/error logs were emitted during this test:\n${details}`);
}

function parseLog(raw: string): SemLangTestLog {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const level = typeof parsed.level === "number" ? parsed.level : failingLevel;
    const message = typeof parsed.msg === "string" ? parsed.msg : undefined;
    return { level, message, raw };
  } catch {
    return { level: failingLevel, raw };
  }
}
