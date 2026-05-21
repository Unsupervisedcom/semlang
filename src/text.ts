/*
 * Purpose: Provides line, comment, block, and expression text helpers for SemLang parsing.
 * Encapsulation: Keep source text mechanics here; grammar-specific parsing decisions should remain in src/parser.ts.
 */

import type { SourceLocation } from "./types.js";

export interface SourceLine {
  text: string;
  stripped: string;
  line: number;
}

export function toLines(source: string): SourceLine[] {
  return source.split(/\r?\n/).map((text, index) => ({
    text,
    stripped: stripLineComment(text),
    line: index + 1,
  }));
}

export function stripLineComment(line: string): string {
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const prev = line[i - 1];
    if ((char === "'" || char === '"') && prev !== "\\") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (!quote && char === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}

export function trimBlankEdges(lines: SourceLine[]): SourceLine[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.stripped.trim() === "") start += 1;
  while (end > start && lines[end - 1]?.stripped.trim() === "") end -= 1;
  return lines.slice(start, end);
}

export function location(file: string | undefined, line: number, text: string, search = text.trim()): SourceLocation {
  const column = Math.max(1, text.indexOf(search) + 1);
  return { file, line, column };
}

export function countNetBraces(text: string): number {
  let quote: "'" | '"' | undefined;
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const prev = text[i - 1];
    if ((char === "'" || char === '"') && prev !== "\\") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) continue;
    if (char === "{") count += 1;
    if (char === "}") count -= 1;
  }
  return count;
}

export function collectBraceBlock(
  lines: SourceLine[],
  start: number,
): { header: SourceLine; body: SourceLine[]; end: number; unclosed: boolean } {
  const header = lines[start]!;
  let depth = countNetBraces(header.stripped);
  const body: SourceLine[] = [];
  let i = start + 1;
  while (i < lines.length && depth > 0) {
    const line = lines[i]!;
    depth += countNetBraces(line.stripped);
    if (depth >= 0) body.push(line);
    i += 1;
  }
  if (body.length > 0 && body[body.length - 1]!.stripped.trim() === "}") {
    body.pop();
  }
  return { header, body, end: i, unclosed: depth > 0 };
}

export function startsDeclaration(trimmed: string): boolean {
  return /^(identity\b|valid_time:|occurrence_time:|observation_time:|recorded_time:|join_one\b|join_many\b|role\b|field:|dimension:|measure:|validation:|view:|where:|description:|type:|refine:)/.test(
    trimmed,
  );
}

export function normalizeExpression(lines: SourceLine[] | string): string {
  if (typeof lines === "string") return lines.trim().replace(/\s+/g, " ");
  return lines
    .map((line) => line.stripped.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
