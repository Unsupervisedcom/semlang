/*
 * Purpose: Compiles SemLang sources supplied through MCP tool arguments into normalized compile inputs.
 * Encapsulation: Keep MCP source argument normalization here; command wiring belongs in semlang-runtime.ts and core compilation belongs in index.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { compileFile, compileSemLang, filePackageLoader } from "./index.js";
import { stringList, stringValue } from "./mcp-utils.js";
import type { CompileResult } from "./types.js";

type McpSourceKind = "file" | "files" | "inline";

export type CompiledMcpSource =
  | {
      ok: true;
      result: CompileResult;
      sourceText: string;
      filePath: string;
      sourcePaths: string[];
      sourceKind: McpSourceKind;
    }
  | { ok: false; error: string };

export async function compileMcpSource(args: Record<string, unknown>): Promise<CompiledMcpSource> {
  const paths = stringList(args.paths ?? args.path ?? args.filePaths ?? args.filePath);
  const inlineSources = stringList(args.sources ?? args.source);
  const inlineSource = inlineSources.length > 0 ? inlineSources.join("\n\n") : undefined;
  const explicitFilePath = stringValue(args.basePath ?? args.filePath);

  if (paths.length > 0) {
    const absolutePaths = paths.map((item) => path.resolve(item));
    if (absolutePaths.length === 1 && inlineSource) {
      const filePath = absolutePaths[0];
      const result = await compileSemLang(inlineSource, {
        filePath,
        packageLoader: filePackageLoader(),
        lintWarnings: true,
      });
      return { ok: true, result, sourceText: inlineSource, filePath, sourcePaths: absolutePaths, sourceKind: "inline" };
    }
    if (absolutePaths.length === 1) {
      const filePath = absolutePaths[0];
      const sourceText = await fs.readFile(filePath, "utf8");
      const result = await compileFile(filePath, { lintWarnings: true });
      return { ok: true, result, sourceText, filePath, sourcePaths: absolutePaths, sourceKind: "file" };
    }

    const filePath = path.join(process.cwd(), "__semlang_mcp_context__.semlang");
    const sourceText = [
      "package semlang.mcp.context",
      ...absolutePaths.map((item) => `include ${JSON.stringify(item)}`),
      inlineSource ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    const result = await compileSemLang(sourceText, {
      filePath,
      packageLoader: filePackageLoader(),
      lintWarnings: true,
    });
    return { ok: true, result, sourceText, filePath, sourcePaths: absolutePaths, sourceKind: "files" };
  }

  if (!inlineSource) return { ok: false, error: "Provide path/paths or source/sources." };

  const filePath = explicitFilePath
    ? path.resolve(explicitFilePath)
    : path.join(process.cwd(), "__semlang_mcp_inline__.semlang");
  const result = await compileSemLang(inlineSource, {
    filePath,
    packageLoader: filePackageLoader(),
    lintWarnings: true,
  });
  return {
    ok: true,
    result,
    sourceText: inlineSource,
    filePath,
    sourcePaths: explicitFilePath ? [filePath] : [],
    sourceKind: "inline",
  };
}
