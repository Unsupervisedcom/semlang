/*
 * Purpose: Verifies SemLang runtime logging configuration and test-time log capture.
 * Encapsulation: Keep logger policy tests here; MCP execution behavior belongs under test/mcp.
 */

import { describe, expect, it } from "vitest";
import { configureSemLangLogger, logTransaction, resolveSemLangLogLevel, setSemLangLogLevel } from "../src/logging.js";
import { resolveSemLangMcpSettings } from "../src/mcp-settings.js";
import { createSemLangMcp } from "../src/semlang-runtime.js";
import { allowSemLangTestLogs, installSemLangTestLogger, semLangTestLogs } from "./test-log-sink.js";

describe("SemLang logging", () => {
  it("filters transaction logs by configured level", () => {
    // 02.05.043: runtime logging honors the managed SemLang log level.
    const lines: string[] = [];
    configureSemLangLogger({
      destination: { write: (message) => lines.push(...message.trim().split("\n").filter(Boolean)) },
      level: "warn",
    });

    try {
      logTransaction("info", "tx-info", "hidden info");
      logTransaction("warn", "tx-warn", "visible warning");
    } finally {
      installSemLangTestLogger();
    }

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      level: 40,
      msg: "visible warning",
      transactionId: "tx-warn",
    });
  });

  it("resolves managed log level settings", () => {
    // 02.05.043: SEMLANG_LOG_LEVEL-compatible values use conventional pino
    // levels, including silent, and flow through MCP settings resolution.
    expect(resolveSemLangLogLevel("silent")).toBe("silent");
    expect(resolveSemLangLogLevel("WARN")).toBe("warn");
    expect(resolveSemLangLogLevel("verbose")).toBeUndefined();
    expect(resolveSemLangMcpSettings({ logLevel: "error" }).logLevel).toBe("error");
  });

  it("lets tests explicitly allow expected warning or error logs", () => {
    // 02.05.043: the test sink fails unexpected warning/error logs, so tests
    // that intentionally exercise one must opt in before emitting it.
    allowSemLangTestLogs((log) => log.message === "expected warning");

    setSemLangLogLevel("warn");
    logTransaction("warn", "tx-expected", "expected warning");

    expect(semLangTestLogs()).toEqual([
      expect.objectContaining({
        level: 40,
        message: "expected warning",
      }),
    ]);
  });

  it("keeps MCP log levels scoped to each API instance", async () => {
    // 02.05.043: MCP log levels are resolved on each context instead of
    // mutating a process-global logger when an API instance is created.
    const lines: string[] = [];
    configureSemLangLogger({
      destination: { write: (message) => lines.push(...message.trim().split("\n").filter(Boolean)) },
      level: "debug",
    });

    try {
      const silentMcp = createSemLangMcp({ logLevel: "silent" });
      createSemLangMcp({ logLevel: "info" });

      await expect(silentMcp.tools["run_query"]({})).rejects.toThrow("No ontology source has been set");
    } finally {
      installSemLangTestLogger();
    }

    expect(lines).toEqual([]);
  });
});
