/*
 * Purpose: Provides small primitives for assembling Malloy text while preserving source-map origins.
 * Encapsulation: Keep emitted-line formatting and indentation helpers here; semantic lowering decisions belong in src/emitter.ts.
 */

import type { Diagnostic, MalloySourceMapEntry, SourceLocation } from "./types.js";

export interface MalloySourceOrigin {
  location: SourceLocation;
  kind: string;
  label: string;
}

export interface EmittedLine {
  text: string;
  origin?: MalloySourceOrigin;
}

export type EmittedBlock = EmittedLine[];

export function buildMalloy(
  chunks: EmittedBlock[],
  diagnostics: Diagnostic[],
): { malloy: string; diagnostics: Diagnostic[]; sourceMap: MalloySourceMapEntry[] } {
  const lines: EmittedBlock = [];
  const nonEmptyChunks = chunks.filter((chunk) => chunk.length > 0);
  for (let i = 0; i < nonEmptyChunks.length; i += 1) {
    if (i > 0) lines.push(line(""));
    lines.push(...nonEmptyChunks[i]!);
  }

  const sourceMap: MalloySourceMapEntry[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const emitted = lines[index]!;
    if (!emitted.origin) continue;
    sourceMap.push({
      generatedStartLine: index + 1,
      generatedEndLine: index + 1,
      location: emitted.origin.location,
      kind: emitted.origin.kind,
      label: emitted.origin.label,
    });
  }

  return { malloy: lines.map((emitted) => emitted.text).join("\n") + "\n", diagnostics, sourceMap };
}

export function origin(location: SourceLocation, kind: string, label: string): MalloySourceOrigin {
  return { location, kind, label };
}

export function line(text: string, lineOrigin?: MalloySourceOrigin): EmittedLine {
  return { text, origin: lineOrigin };
}

export function indent(lines: EmittedBlock, count: number): EmittedBlock {
  return lines.map((emitted) => ({ ...emitted, text: `${spaces(count)}${emitted.text}` }));
}

export function spaces(count: number): string {
  return " ".repeat(count);
}
