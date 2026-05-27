/*
 * Purpose: Centralizes structured logging for SemLang runtime transactions.
 * Encapsulation: Keep logger setup and transaction log shape here; callers should pass context instead of configuring logging themselves.
 */

import pino from "pino";
import type { DestinationStream } from "pino";

type LogLevel = "debug" | "info" | "warn" | "error";

export const semLangLogLevels = ["debug", "info", "warn", "error", "silent"] as const;
export type SemLangLogLevel = (typeof semLangLogLevels)[number];

const logLevelValues: Record<LogLevel | "silent", number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  silent: Infinity,
};

// MCP stdio uses stdout for protocol messages, so server logs must use stderr.
let loggerDestination: DestinationStream = pino.destination(process.stderr.fd);
let defaultLoggerLevel: SemLangLogLevel = resolveSemLangLogLevel(process.env.SEMLANG_LOG_LEVEL) ?? "info";
let logger = pino({ level: "debug", name: "semlang" }, loggerDestination);

export function resolveSemLangLogLevel(value: unknown): SemLangLogLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return semLangLogLevels.find((level) => level === normalized);
}

export function configureSemLangLogger(options: { destination?: DestinationStream; level?: SemLangLogLevel }): void {
  defaultLoggerLevel = options.level ?? defaultLoggerLevel;
  if (options.destination) {
    loggerDestination = options.destination;
    logger = pino({ level: "debug", name: "semlang" }, loggerDestination);
  }
}

export function setSemLangLogLevel(level: SemLangLogLevel): void {
  configureSemLangLogger({ level });
}

export function logTransaction(
  level: LogLevel,
  transactionId: string,
  message: string,
  params: Record<string, unknown> = {},
  options: { logLevel?: SemLangLogLevel } = {},
): void {
  if (!shouldLog(level, options.logLevel ?? defaultLoggerLevel)) return;
  logger[level]({ ...params, transactionId }, message);
}

function shouldLog(level: LogLevel, configuredLevel: SemLangLogLevel): boolean {
  return logLevelValues[level] >= logLevelValues[configuredLevel];
}
