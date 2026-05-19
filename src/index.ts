import fs from "node:fs/promises";
import path from "node:path";
import { emitMalloy } from "./emitter.js";
import { parseOntoql } from "./parser.js";
import { resolveOntoql } from "./resolver.js";
import { emitJsonSchema } from "./schema.js";
import type { CompileOptions, CompileResult, PackageLoader } from "./types.js";

export { emitMalloy } from "./emitter.js";
export { createOntoqlMcp, createOntoqlMcpServer, runOntoqlMcpStdioServer } from "./mcp.js";
export { parseOntoql } from "./parser.js";
export { applyQueryLenses, resolveOntoql } from "./resolver.js";
export { emitJsonSchema, ontoqlVocabularyUri } from "./schema.js";
export type * from "./types.js";

export async function compileOntoql(source: string, options: CompileOptions = {}): Promise<CompileResult> {
  const parsed = parseOntoql(source, options);
  if (!parsed.ast) return { diagnostics: parsed.diagnostics };
  const resolved = await resolveOntoql(parsed.ast, options);
  const diagnostics = [...parsed.diagnostics, ...resolved.diagnostics];
  if (!resolved.model) return { ast: parsed.ast, diagnostics };
  const emitted = emitMalloy(resolved.model);
  diagnostics.push(...emitted.diagnostics);
  const schema = emitJsonSchema(resolved.model);
  diagnostics.push(...schema.diagnostics);
  return { ast: parsed.ast, model: resolved.model, malloy: emitted.malloy, jsonSchema: schema.schema, diagnostics };
}

export async function compileFile(filePath: string, options: CompileOptions = {}): Promise<CompileResult> {
  const absolute = path.resolve(filePath);
  const source = await fs.readFile(absolute, "utf8");
  const packageLoader = options.packageLoader ?? filePackageLoader();
  return compileOntoql(source, { ...options, filePath: absolute, packageLoader });
}

export function filePackageLoader(): PackageLoader {
  return {
    async load(includePath: string, fromFile?: string) {
      const base = fromFile ? path.dirname(fromFile) : process.cwd();
      const filePath = path.resolve(base, includePath);
      return { filePath, source: await fs.readFile(filePath, "utf8") };
    }
  };
}
