import pino from "pino";

type LogLevel = "debug" | "info" | "warn" | "error";

// MCP stdio uses stdout for protocol messages, so server logs must use stderr.
const logger = pino({ name: "semlang" }, pino.destination(process.stderr.fd));

export function logTransaction(
  level: LogLevel,
  transactionId: string,
  message: string,
  params: Record<string, unknown> = {},
): void {
  logger[level]({ ...params, transactionId }, message);
}
