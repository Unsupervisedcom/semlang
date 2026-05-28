/*
 * Purpose: Parses SemLang source text into an AST with syntax diagnostics and source locations.
 * Encapsulation: Keep syntax recognition and AST construction here; include loading, semantic validation, and lowering belong to resolver and emitter phases.
 */

import { lexSemLang } from "./lexer.js";
import { primitiveTypes } from "./language-constants.js";
import { parseMetadataLiteral, parseMetadataStringArray } from "./schema-metadata.js";
import {
  collectBraceBlock,
  countNetBraces,
  location,
  normalizeExpression,
  startsDeclaration,
  toLines,
  trimBlankEdges,
  type SourceLine,
} from "./text.js";
import {
  emptyMembers,
  type ActionDecl,
  type ActionEditDecl,
  type ActionGuardDecl,
  type ActionInsertAssignmentDecl,
  type ActionMetadataBlockDecl,
  type ActionParamDecl,
  type CompileOptions,
  type ConceptDecl,
  type ConceptMembers,
  type DefinitionDecl,
  type Diagnostic,
  type FieldDecl,
  type IgnoredDecl,
  type IdentityField,
  type JoinDecl,
  type LensDecl,
  type MetadataEntry,
  type ParseResult,
  type ParseQueryResult,
  type QueryBodyDecl,
  type QueryDecl,
  type QueryItemDecl,
  type QueryNestDecl,
  type RefinementDecl,
  type RoleDecl,
  type SemLangAst,
  type SourceDecl,
  type SourceExpression,
  type TemporalAxisDecl,
  type TypeDecl,
  type ValidationDecl,
  type ViewDecl,
  type WriteMappingDecl,
} from "./types.js";

export function parseSemLang(source: string, options: CompileOptions = {}): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const lexResult = lexSemLang(source);
  for (const error of lexResult.errors) {
    diagnostics.push({
      severity: "error",
      code: "LEX_ERROR",
      message: error.message,
      location: { file: options.filePath, line: error.line ?? 1, column: error.column ?? 1 },
    });
  }

  const lines = toLines(source);
  const state = parseSemLangState(options.filePath, diagnostics);

  let i = 0;
  while (i < lines.length) {
    i = parseTopLevelMember(state, lines, i);
  }

  if (!state.packageName) {
    diagnostics.push({
      severity: "error",
      code: "MISSING_PACKAGE",
      message: "SemLang files must declare a package.",
      location: { file: options.filePath, line: 1, column: 1 },
    });
  }

  return {
    ast: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? undefined : state.ast,
    diagnostics,
  };
}

interface ParseSemLangState {
  ast: SemLangAst;
  diagnostics: Diagnostic[];
  file: string | undefined;
  packageName: string;
}

function parseSemLangState(file: string | undefined, diagnostics: Diagnostic[]): ParseSemLangState {
  return {
    ast: {
      kind: "SemLangAst",
      packageName: "",
      filePath: file,
      includes: [],
      ignored: [],
      sources: [],
      types: [],
      concepts: [],
      lenses: [],
      queries: [],
    },
    diagnostics,
    file,
    packageName: "",
  };
}

function parseTopLevelMember(state: ParseSemLangState, lines: SourceLine[], index: number): number {
  const line = lines[index]!;
  const trimmed = line.stripped.trim();
  if (trimmed === "") return index + 1;

  const packageMatch = /^package\s+([A-Za-z_][A-Za-z0-9_.]*)$/.exec(trimmed);
  if (packageMatch) return parsePackageDecl(state, line, packageMatch, index);
  const includeMatch = /^include\s+["']([^"']+)["']$/.exec(trimmed);
  if (includeMatch) return parseIncludeDecl(state, line, includeMatch, index);
  const parsed = parseTopLevelBlock(state, lines, index, trimmed);
  if (parsed !== undefined) return parsed;

  state.diagnostics.push(error("UNEXPECTED_TOP_LEVEL", `Unexpected top-level syntax: ${trimmed}`, state.file, line));
  return index + 1;
}

function parsePackageDecl(state: ParseSemLangState, line: SourceLine, match: RegExpExecArray, index: number): number {
  if (state.packageName) {
    state.diagnostics.push(error("DUPLICATE_PACKAGE", "Only one package declaration is allowed.", state.file, line));
  }
  state.packageName = match[1]!;
  state.ast.packageName = state.packageName;
  state.ast.location = location(state.file, line.line, line.text, "package");
  return index + 1;
}

function parseIncludeDecl(state: ParseSemLangState, line: SourceLine, match: RegExpExecArray, index: number): number {
  state.ast.includes.push({ path: match[1]!, location: location(state.file, line.line, line.text, "include") });
  return index + 1;
}

function parseTopLevelBlock(
  state: ParseSemLangState,
  lines: SourceLine[],
  index: number,
  trimmed: string,
): number | undefined {
  if (/^type:/.test(trimmed)) return parseBraceTopLevelBlock(state, lines, index, parseType, state.ast.types);
  if (/^ignored\b/.test(trimmed))
    return parseDeclarationTopLevelBlock(state, lines, index, parseIgnored, state.ast.ignored);
  if (/^source:/.test(trimmed)) return parseSourceTopLevelBlock(state, lines, index);
  if (/^concept\b/.test(trimmed))
    return parseDeclarationTopLevelBlock(state, lines, index, parseConcept, state.ast.concepts);
  if (/^lens:/.test(trimmed)) return parseBraceTopLevelBlock(state, lines, index, parseLens, state.ast.lenses);
  if (/^query:/.test(trimmed)) return parseBraceTopLevelBlock(state, lines, index, parseQuery, state.ast.queries);
  return undefined;
}

function parseBraceTopLevelBlock<T>(
  state: ParseSemLangState,
  lines: SourceLine[],
  index: number,
  parser: (
    header: SourceLine,
    body: SourceLine[],
    file: string | undefined,
    diagnostics: Diagnostic[],
  ) => T | undefined,
  target: T[],
): number {
  const block = collectBraceBlock(lines, index);
  diagnoseUnclosedBlock(block, state.file, state.diagnostics);
  const parsed = parser(block.header, block.body, state.file, state.diagnostics);
  if (parsed) target.push(parsed);
  return block.end;
}

function parseDeclarationTopLevelBlock<T>(
  state: ParseSemLangState,
  lines: SourceLine[],
  index: number,
  parser: (
    header: SourceLine,
    body: SourceLine[],
    file: string | undefined,
    diagnostics: Diagnostic[],
  ) => T | undefined,
  target: T[],
): number {
  const block = collectDeclarationBlock(lines, index);
  diagnoseUnclosedBlock(block, state.file, state.diagnostics);
  const parsed = parser(block.header, block.body, state.file, state.diagnostics);
  if (parsed) target.push(parsed);
  return block.end;
}

function parseSourceTopLevelBlock(state: ParseSemLangState, lines: SourceLine[], index: number): number {
  const header = collectSourceHeader(lines, index);
  const parsed = header.header.stripped.includes("->")
    ? parseSourceBlock(lines, index, state.file, state.diagnostics)
    : { source: parseSource(header.header, [], state.file, state.diagnostics), end: header.end };
  if (parsed.source) state.ast.sources.push(parsed.source);
  return parsed.end;
}

export function parseSemLangQuery(source: string, options: CompileOptions = {}): ParseQueryResult {
  const diagnostics: Diagnostic[] = [];
  const lines = toLines(source);
  let query: QueryDecl | undefined;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }
    if (!/^query:/.test(trimmed)) {
      diagnostics.push(
        error("UNEXPECTED_TOP_LEVEL", `Unexpected top-level syntax: ${trimmed}`, options.filePath, line),
      );
      i += 1;
      continue;
    }
    if (query) {
      diagnostics.push(error("DUPLICATE_QUERY", "Only one query declaration is allowed.", options.filePath, line));
      i += 1;
      continue;
    }
    const block = collectBraceBlock(lines, i);
    diagnoseUnclosedBlock(block, options.filePath, diagnostics);
    query = parseQuery(block.header, block.body, options.filePath, diagnostics);
    i = block.end;
  }

  const hasParseErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  if (!query && !hasParseErrors) {
    diagnostics.push({
      severity: "error",
      code: "MISSING_QUERY",
      message: "Provide a query declaration.",
      location: { file: options.filePath, line: 1, column: 1 },
    });
  }

  return { query: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? undefined : query, diagnostics };
}

function parseType(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): TypeDecl | undefined {
  const match = /^type:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_TYPE_DECL", "Invalid type declaration.", file, header));
    return undefined;
  }
  return {
    name: match[1]!,
    base: match[2]!,
    metadata: parseTypeMetadata(body, file),
    location: location(file, header.line, header.text, "type"),
  };
}

function parseTypeMetadata(body: SourceLine[], file: string | undefined): MetadataEntry[] {
  const lines = trimBlankEdges(body).filter((line) => line.stripped.trim() !== "");
  const metadata: MetadataEntry[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const [keyPart, ...valueParts] = line.stripped.trim().split(":");
    let value = valueParts.join(":").trim();
    let balance = delimiterBalance(value);
    while (balance > 0 && i + 1 < lines.length) {
      i += 1;
      const continuation = lines[i]!.stripped.trim();
      value = `${value} ${continuation}`;
      balance += delimiterBalance(continuation);
    }
    metadata.push({
      key: keyPart!.trim(),
      value,
      location: location(file, line.line, line.text, keyPart),
    });
  }
  return metadata;
}

function parseIgnored(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): IgnoredDecl | undefined {
  const match = /^ignored\s+(.+?)\s*\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_IGNORED_DECL", "Invalid ignored declaration.", file, header));
    return undefined;
  }
  const source = parseSourceExpression(match[1]!, file, header, diagnostics);
  if (!source) return undefined;
  const metadata = parseMetadataEntries(body, file);
  const reason = metadata.find((entry) => entry.key === "reason")?.value;
  return {
    source,
    reason,
    metadata,
    location: location(file, header.line, header.text, "ignored"),
  };
}

function delimiterBalance(text: string): number {
  let balance = 0;
  let quote: string | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if ((char === "'" || char === '"') && text[i - 1] !== "\\") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) continue;
    if (char === "[" || char === "{" || char === "(") balance += 1;
    if (char === "]" || char === "}" || char === ")") balance -= 1;
  }
  return balance;
}

function parseSourceBlock(
  lines: SourceLine[],
  start: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
): { source?: SourceDecl; end: number } {
  const block = collectDeclarationBlock(lines, start);
  diagnoseUnclosedBlock(block, file, diagnostics);
  return { source: parseSource(block.header, block.body, file, diagnostics), end: block.end };
}

function parseSource(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): SourceDecl | undefined {
  const queryMatch = /^source:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(.+?)\s*->\s*\{$/.exec(header.stripped.trim());
  if (queryMatch) {
    const source = parseSourceExpression(queryMatch[2]!, file, header, diagnostics);
    if (!source) return undefined;
    return {
      name: queryMatch[1]!,
      source,
      query: parseQueryBody(body, file, diagnostics),
      location: location(file, header.line, header.text, "source"),
    };
  }

  const match = /^source:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(.+)$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_SOURCE_DECL", "Invalid source declaration.", file, header));
    return undefined;
  }
  const source = parseSourceExpression(match[2]!, file, header, diagnostics);
  if (!source) return undefined;
  return {
    name: match[1]!,
    source,
    location: location(file, header.line, header.text, "source"),
  };
}

function parseConcept(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): ConceptDecl | undefined {
  const match =
    /^concept\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(?:(phase)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)|(kind|event|situation|relator))\s+from\s+(.+?)\s*\{$/.exec(
      header.stripped.trim(),
    );
  if (!match) {
    diagnostics.push(error("INVALID_CONCEPT_DECL", "Invalid concept declaration.", file, header));
    return undefined;
  }
  const source = parseSourceExpression(match[5]!, file, header, diagnostics);
  if (!source) return undefined;
  const members = parseConceptMembers(body, file, diagnostics);
  return {
    name: match[1]!,
    stereotype: (match[2] ? "phase" : match[4]) as ConceptDecl["stereotype"],
    phaseParent: match[3],
    source,
    location: location(file, header.line, header.text, "concept"),
    ...members,
  };
}

function parseSourceExpression(
  text: string,
  file: string | undefined,
  line: SourceLine,
  diagnostics: Diagnostic[],
): SourceExpression | undefined {
  const expression = normalizeSourceExpression(text);
  const connectionMatch = /^([A-Za-z_][A-Za-z0-9_]*)\.(table|sql)\(([\s\S]*)\)$/.exec(expression);
  if (connectionMatch) {
    const method = connectionMatch[2]!;
    const argument = parseSourceStringArgument(connectionMatch[3]!, line, file, diagnostics);
    if (argument === undefined) return undefined;
    if (method === "table") {
      return {
        kind: "table",
        connection: connectionMatch[1]!,
        path: argument,
        expression,
        location: location(file, line.line, line.text, expression),
      };
    }
    return {
      kind: "sql",
      connection: connectionMatch[1]!,
      sql: argument,
      expression,
      location: location(file, line.line, line.text, expression),
    };
  }

  if (/^table\(/.test(expression) || /^sql\(/.test(expression)) {
    diagnostics.push(
      error(
        "UNQUALIFIED_SOURCE",
        `Source expression ${expression} is missing a named Malloy connection; use a form like duckdb.${expression}.`,
        file,
        line,
      ),
    );
    return undefined;
  }

  const referenceMatch = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(expression);
  if (referenceMatch) {
    return {
      kind: "reference",
      name: referenceMatch[1]!,
      expression,
      location: location(file, line.line, line.text, expression),
    };
  }

  diagnostics.push(error("INVALID_SOURCE_EXPR", `Invalid source expression: ${expression}`, file, line));
  return undefined;
}

function parseSourceStringArgument(
  text: string,
  line: SourceLine,
  file: string | undefined,
  diagnostics: Diagnostic[],
): string | undefined {
  const trimmed = text.trim();
  const triple = /^"""([\s\S]*)"""$/.exec(trimmed);
  if (triple) return triple[1]!;
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  if (quoted) return quoted[2]!;
  diagnostics.push(
    error("INVALID_SOURCE_EXPR", `Source method argument must be a string literal: ${trimmed}`, file, line),
  );
  return undefined;
}

function normalizeSourceExpression(text: string): string {
  return text.trim();
}

function collectSourceHeader(lines: SourceLine[], start: number): { header: SourceLine; end: number } {
  const collected = [lines[start]!];
  let i = start + 1;
  while (i < lines.length && !sourceHeaderComplete(combineHeader(collected).stripped)) {
    collected.push(lines[i]!);
    i += 1;
  }
  return { header: combineHeader(collected), end: i };
}

function sourceHeaderComplete(text: string): boolean {
  if (text.includes("->")) return text.includes("{");
  const sourceMatch = /^source:\s+[A-Za-z_][A-Za-z0-9_]*\s+is\s+([\s\S]+)$/.exec(text.trim());
  if (!sourceMatch) return true;
  const expression = sourceMatch[1]!.trim();
  return tripleQuoteCount(expression) % 2 === 0 && parenBalance(expression) <= 0;
}

function collectDeclarationBlock(
  lines: SourceLine[],
  start: number,
): { header: SourceLine; body: SourceLine[]; end: number; unclosed: boolean } {
  const collected = [lines[start]!];
  let i = start + 1;
  while (i < lines.length && !combineHeader(collected).stripped.includes("{")) {
    collected.push(lines[i]!);
    i += 1;
  }

  const header = combineHeader(collected);
  let depth = countNetBraces(header.stripped);
  const body: SourceLine[] = [];
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

function combineHeader(lines: SourceLine[]): SourceLine {
  const first = lines[0]!;
  return {
    line: first.line,
    text: lines.map((line) => line.text.trim()).join(" "),
    stripped: lines.map((line) => line.stripped.trim()).join(" "),
  };
}

function tripleQuoteCount(text: string): number {
  return text.match(/"""/g)?.length ?? 0;
}

function parenBalance(text: string): number {
  let depth = 0;
  let quote: "'" | '"' | undefined;
  for (let i = 0; i < text.length; i += 1) {
    if (text.slice(i, i + 3) === '"""') {
      i += 2;
      continue;
    }
    const char = text[i]!;
    const prev = text[i - 1];
    if ((char === "'" || char === '"') && prev !== "\\") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
  }
  return depth;
}

function parseLens(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): LensDecl | undefined {
  const match = /^lens:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(?:(.*?)\s+extend\s+)?\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_LENS_DECL", "Invalid lens declaration.", file, header));
    return undefined;
  }
  const lens: LensDecl = {
    name: match[1]!,
    parents: match[2]
      ? match[2]
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean)
      : [],
    types: [],
    refinements: [],
    location: location(file, header.line, header.text, "lens"),
  };

  let i = 0;
  while (i < body.length) {
    const line = body[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }
    const desc = /^description:\s*(.*)$/.exec(trimmed);
    if (desc) {
      lens.description = desc[1]!.trim();
      i += 1;
      continue;
    }
    if (/^type:/.test(trimmed)) {
      const block = collectBraceBlock(body, i);
      diagnoseUnclosedBlock(block, file, diagnostics);
      const parsed = parseType(block.header, block.body, file, diagnostics);
      if (parsed) lens.types.push(parsed);
      i = block.end;
      continue;
    }
    if (/^refine:/.test(trimmed)) {
      const block = collectBraceBlock(body, i);
      diagnoseUnclosedBlock(block, file, diagnostics);
      const parsed = parseRefinement(block.header, block.body, file, diagnostics);
      if (parsed) lens.refinements.push(parsed);
      i = block.end;
      continue;
    }
    diagnostics.push(error("UNEXPECTED_LENS_MEMBER", `Unexpected lens member: ${trimmed}`, file, line));
    i += 1;
  }
  return lens;
}

function parseRefinement(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): RefinementDecl | undefined {
  const match = /^refine:\s+([A-Za-z_][A-Za-z0-9_]*)\s+extend\s+\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_REFINEMENT", "Invalid refinement declaration.", file, header));
    return undefined;
  }
  return {
    conceptName: match[1]!,
    members: parseConceptMembers(body, file, diagnostics),
    location: location(file, header.line, header.text, "refine"),
  };
}

function parseQuery(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): QueryDecl | undefined {
  const blockMatch =
    /^query:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*))?\s*->\s+\{$/.exec(
      header.stripped.trim(),
    );
  if (blockMatch) {
    return {
      name: blockMatch[1]!,
      root: blockMatch[2]!,
      lenses: blockMatch[3] ? blockMatch[3].split(",").map((part) => part.trim()) : [],
      body: parseQueryBody(body, file, diagnostics),
      location: location(file, header.line, header.text, "query"),
    };
  }

  const viewMatch =
    /^query:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*))?\s*->\s*([A-Za-z_][A-Za-z0-9_]*)$/.exec(
      header.stripped.trim(),
    );
  if (!viewMatch) {
    diagnostics.push(error("INVALID_QUERY_DECL", "Invalid query declaration.", file, header));
    return undefined;
  }
  return {
    name: viewMatch[1]!,
    root: viewMatch[2]!,
    lenses: viewMatch[3] ? viewMatch[3].split(",").map((part) => part.trim()) : [],
    view: viewMatch[4]!,
    body: emptyQueryBody(),
    location: location(file, header.line, header.text, "query"),
  };
}

function parseConceptMembers(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): ConceptMembers {
  const members = emptyMembers();
  let i = 0;
  while (i < lines.length) {
    i = parseConceptMember(lines, i, file, diagnostics, members);
  }
  return members;
}

type ConceptMemberParser = (
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
) => number | undefined;

const conceptMemberParsers: ConceptMemberParser[] = [
  parseBlankConceptMember,
  parseIdentityConceptMember,
  parseTemporalConceptMember,
  parseJoinConceptMember,
  parseRoleConceptMember,
  parseFieldConceptMember,
  parseDefinitionConceptMember,
  parseWhereConceptMember,
  parseValidationConceptMember,
  parseViewConceptMember,
  parseActionConceptMember,
  parseDescriptionConceptMember,
];

function parseConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number {
  for (const parser of conceptMemberParsers) {
    const next = parser(lines, index, file, diagnostics, members);
    if (next !== undefined) return next;
  }
  const line = lines[index]!;
  const trimmed = line.stripped.trim();
  diagnostics.push(error("UNEXPECTED_CONCEPT_MEMBER", `Unexpected concept member: ${trimmed}`, file, line));
  return index + 1;
}

function parseBlankConceptMember(lines: SourceLine[], index: number): number | undefined {
  return lines[index]!.stripped.trim() === "" ? index + 1 : undefined;
}

function parseIdentityConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  const line = lines[index]!;
  const trimmed = line.stripped.trim();
  if (!/^identity\b/.test(trimmed)) return undefined;
  if (!trimmed.includes("{")) {
    members.identities.push(...parseIdentityLine(line, [], file, diagnostics));
    return index + 1;
  }
  const block = collectBraceBlock(lines, index);
  diagnoseUnclosedBlock(block, file, diagnostics);
  members.identities.push(...parseIdentityLine(block.header, block.body, file, diagnostics));
  return block.end;
}

function parseTemporalConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  _diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  const line = lines[index]!;
  const temporal = /^(valid_time|occurrence_time|observation_time|recorded_time):\s*(.+)$/.exec(line.stripped.trim());
  if (!temporal) return undefined;
  members.temporal.push({
    axis: temporal[1] as TemporalAxisDecl["axis"],
    expression: temporal[2]!.trim(),
    location: location(file, line.line, line.text, temporal[1]),
  });
  return index + 1;
}

function parseJoinConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  if (!/^join_(one|many|cross)\b/.test(lines[index]!.stripped.trim())) return undefined;
  const collected = collectContinuation(lines, index, (next) => /^(on\b|with\b|and\b|at\b)/.test(next.stripped.trim()));
  const parsed = parseJoin(collected.lines, file, diagnostics);
  if (parsed) members.joins.push(parsed);
  return collected.end;
}

function parseRoleConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  const trimmed = lines[index]!.stripped.trim();
  if (!/^role\b/.test(trimmed)) return undefined;
  if (trimmed.includes("{")) return parseBraceRoleConceptMember(lines, index, file, diagnostics, members);
  const collected = collectContinuation(lines, index, (next) => next.stripped.trim().startsWith("when "));
  const parsed = parseRole(collected.lines, [], file, diagnostics);
  if (parsed) members.roles.push(parsed);
  return collected.end;
}

function parseBraceRoleConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number {
  const block = collectBraceBlock(lines, index);
  diagnoseUnclosedBlock(block, file, diagnostics);
  const parsed = parseRole([block.header], block.body, file, diagnostics);
  if (parsed) members.roles.push(parsed);
  return block.end;
}

function parseFieldConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  if (lines[index]!.stripped.trim() !== "field:") return undefined;
  const collected = collectSection(lines, index + 1);
  members.fields.push(...parseFields(collected.lines, file, diagnostics));
  return collected.end;
}

function parseDefinitionConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  const trimmed = lines[index]!.stripped.trim();
  if (trimmed !== "dimension:" && trimmed !== "measure:") return undefined;
  const collected = collectSection(lines, index + 1);
  const defs = parseDefinitions(collected.lines, file, diagnostics);
  if (trimmed === "dimension:") members.dimensions.push(...defs);
  else members.measures.push(...defs);
  return collected.end;
}

function parseWhereConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  _diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  const line = lines[index]!;
  const trimmed = line.stripped.trim();
  if (trimmed !== "where:" && !trimmed.startsWith("where: ")) return undefined;
  const first =
    trimmed === "where:" ? undefined : { ...line, stripped: line.stripped.replace(/^(\s*)where:\s*/, "$1") };
  const collected = collectSection(lines, index + 1);
  members.where.push({
    expression: normalizeExpression(first ? [first, ...collected.lines] : collected.lines),
    location: location(file, line.line, line.text, "where"),
  });
  return collected.end;
}

function parseValidationConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  return lines[index]!.stripped.trim() === "validation:"
    ? parseValidationSection(lines, index + 1, file, diagnostics, members)
    : undefined;
}

function parseViewConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  if (!/^view:/.test(lines[index]!.stripped.trim())) return undefined;
  return parseBraceConceptMember(lines, index, file, diagnostics, members.views, parseView);
}

function parseActionConceptMember(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  if (!/^action\b/.test(lines[index]!.stripped.trim())) return undefined;
  return parseBraceConceptMember(lines, index, file, diagnostics, members.actions, parseAction);
}

function parseBraceConceptMember<T>(
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  target: T[],
  parser: (
    header: SourceLine,
    body: SourceLine[],
    file: string | undefined,
    diagnostics: Diagnostic[],
  ) => T | undefined,
): number {
  const block = collectBraceBlock(lines, index);
  diagnoseUnclosedBlock(block, file, diagnostics);
  const parsed = parser(block.header, block.body, file, diagnostics);
  if (parsed) target.push(parsed);
  return block.end;
}

function parseDescriptionConceptMember(
  lines: SourceLine[],
  index: number,
  _file: string | undefined,
  _diagnostics: Diagnostic[],
  members: ConceptMembers,
): number | undefined {
  const trimmed = lines[index]!.stripped.trim();
  if (!/^description:\s*/.test(trimmed)) return undefined;
  members.description = parseDescription(trimmed.replace(/^description:\s*/, ""));
  return index + 1;
}

function parseValidationSection(
  lines: SourceLine[],
  start: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
  members: ConceptMembers,
): number {
  for (let i = start; i < lines.length; i += 1) {
    const validationLine = lines[i]!;
    const trimmed = validationLine.stripped.trim();
    if (trimmed === "") continue;
    if (startsConceptMemberDeclaration(trimmed)) return i;
    const block = collectBraceBlock(lines, i);
    diagnoseUnclosedBlock(block, file, diagnostics);
    const parsed = parseValidation(block.header, block.body, file, diagnostics);
    if (parsed) members.validations.push(parsed);
    i = block.end - 1;
  }
  return lines.length;
}

function parseDescription(text: string): string {
  const trimmed = text.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? quoted[2]! : trimmed;
}

function parseIdentityLine(
  line: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): IdentityField[] {
  const rest = line.stripped
    .trim()
    .replace(/\s*\{\s*$/, "")
    .replace(/^identity\s+/, "");
  const description = parseMemberDescriptionOnly(body, file, diagnostics);
  return rest
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const parsed = parseTypedName(part, line, file, diagnostics);
      return parsed ? [{ ...parsed, description, location: location(file, line.line, line.text, parsed.name) }] : [];
    });
}

function parseFields(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): FieldDecl[] {
  const fields: FieldDecl[] = [];
  const trimmedLines = trimBlankEdges(lines);
  let i = 0;
  while (i < trimmedLines.length) {
    const line = trimmedLines[i]!;
    const trimmed = line.stripped.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    const block = trimmed.includes("{") ? collectBraceBlock(trimmedLines, i) : undefined;
    if (block) diagnoseUnclosedBlock(block, file, diagnostics);
    const header = block?.header ?? line;
    const parsed = parseFieldHeader(header, block?.body ?? [], file, diagnostics);
    if (parsed) fields.push(parsed);
    i = block?.end ?? i + 1;
  }
  return fields;
}

function parseFieldHeader(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): FieldDecl | undefined {
  const text = header.stripped
    .trim()
    .replace(/\s*\{\s*$/, "")
    .trim();
  const unique = /\s+unique(?:\s|$)/.test(text);
  const writeable = /\s+writeable(?:\s|$)/.test(text);
  const indexed = /\s+indexed(?:\s|$)/.test(text);
  const withoutModifiers = text.replace(/\s+(?:unique|writeable|indexed)\b/g, "").trim();
  const parsed = parseTypedName(withoutModifiers, header, file, diagnostics);
  if (!parsed) return undefined;
  const metadata = parseDescribedWriteMappings(body, file, diagnostics);
  const writeMappings =
    writeable && metadata.writeMappings.length === 0
      ? [{ kind: "default" as const, location: location(file, header.line, header.text, parsed.name) }]
      : metadata.writeMappings;
  return {
    ...parsed,
    description: metadata.description,
    unique,
    writeable,
    indexed,
    writeMappings,
    location: location(file, header.line, header.text, parsed.name),
  };
}

function parseTypedName(
  text: string,
  line: SourceLine,
  file: string | undefined,
  diagnostics: Diagnostic[],
): Omit<FieldDecl, "unique" | "writeable" | "indexed" | "writeMappings" | "location"> | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)(\?)?$/.exec(text.trim());
  if (!match) {
    diagnostics.push(error("INVALID_TYPED_NAME", `Invalid typed declaration: ${text.trim()}`, file, line));
    return undefined;
  }
  return { name: match[1]!, typeName: match[2]!, nullable: Boolean(match[3]) };
}

function parseJoin(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): JoinDecl | undefined {
  const text = normalizeExpression(lines);
  const match = /^(join_one|join_many|join_cross)\s+([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*(.+)$/.exec(text);
  if (!match) {
    diagnostics.push(error("INVALID_JOIN", `Invalid join declaration: ${text}`, file, lines[0]!));
    return undefined;
  }
  const kind = match[1] as JoinDecl["kind"];
  const parsed = parseJoinRemainder(match[4]!, lines[0]!, file, diagnostics);
  if (!parsed) return undefined;
  const { target, targetSource, operator, condition, at } = parsed;
  if (kind !== "join_cross" && !operator) {
    diagnostics.push(error("INVALID_JOIN", `Invalid join declaration: ${text}`, file, lines[0]!));
    return undefined;
  }
  if (kind === "join_cross" && operator === "with") {
    diagnostics.push(error("INVALID_JOIN", "join_cross does not support with joins.", file, lines[0]!));
    return undefined;
  }
  if (targetSource && kind !== "join_one") {
    diagnostics.push(error("INVALID_JOIN", "Inline source targets are only supported for join_one.", file, lines[0]!));
    return undefined;
  }
  return {
    kind,
    name: match[2]!,
    optional: Boolean(match[3]),
    target,
    targetSource,
    on: operator === "on" ? condition : "",
    with: operator === "with" ? condition : undefined,
    at,
    location: location(file, lines[0]!.line, lines[0]!.text, match[1]),
  };
}

function parseJoinRemainder(
  text: string,
  line: SourceLine,
  file: string | undefined,
  diagnostics: Diagnostic[],
):
  | {
      target: string;
      targetSource?: SourceExpression;
      operator?: "on" | "with";
      condition: string;
      at?: string;
    }
  | undefined {
  const operatorMatch = findTopLevelKeyword(text, [" on ", " with "]);
  const targetText = (operatorMatch ? text.slice(0, operatorMatch.index) : text).trim();
  const parsedTarget = parseJoinTarget(targetText, line, file, diagnostics);
  if (!parsedTarget) return undefined;
  if (!operatorMatch) return { ...parsedTarget, condition: "" };

  const operator = operatorMatch.keyword.trim() as "on" | "with";
  const conditionText = text.slice(operatorMatch.index + operatorMatch.keyword.length).trim();
  const atMatch = findTopLevelKeywordFromRight(conditionText, " at ");
  const condition = (atMatch ? conditionText.slice(0, atMatch.index) : conditionText).trim();
  const at = atMatch ? conditionText.slice(atMatch.index + atMatch.keyword.length).trim() : undefined;
  if (!condition) {
    diagnostics.push(error("INVALID_JOIN", `Invalid join declaration: ${text}`, file, line));
    return undefined;
  }
  return { ...parsedTarget, operator, condition, at };
}

function parseJoinTarget(
  text: string,
  line: SourceLine,
  file: string | undefined,
  diagnostics: Diagnostic[],
): { target: string; targetSource?: SourceExpression } | undefined {
  if (/^[A-Za-z_][A-Za-z0-9_]*\.(?:table|sql)\(/.test(text)) {
    const source = parseSourceExpression(text, file, line, diagnostics);
    return source ? { target: source.expression, targetSource: source } : undefined;
  }
  const referenceMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)$/.exec(text);
  if (referenceMatch) return { target: referenceMatch[1]! };
  diagnostics.push(error("INVALID_JOIN", `Invalid join target: ${text}`, file, line));
  return undefined;
}

function findTopLevelKeyword(text: string, keywords: string[]): { index: number; keyword: string } | undefined {
  for (let i = 0; i < text.length; i += 1) {
    const state = sourceExpressionScannerState(text, i);
    if (state.depth > 0 || state.quote) continue;
    const keyword = keywords.find((candidate) => text.startsWith(candidate, i));
    if (keyword) return { index: i, keyword };
  }
  return undefined;
}

function findTopLevelKeywordFromRight(text: string, keyword: string): { index: number; keyword: string } | undefined {
  let match: { index: number; keyword: string } | undefined;
  for (let i = 0; i < text.length; i += 1) {
    const state = sourceExpressionScannerState(text, i);
    if (state.depth > 0 || state.quote) continue;
    if (text.startsWith(keyword, i)) match = { index: i, keyword };
  }
  return match;
}

function sourceExpressionScannerState(text: string, end: number): { depth: number; quote?: string } {
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < end; i += 1) {
    const char = text[i]!;
    const next = text.slice(i, i + 3);
    if (quote) {
      if (quote.length === 3 && next === quote) {
        quote = undefined;
        i += 2;
      } else if (quote.length === 1 && char === quote && text[i - 1] !== "\\") {
        quote = undefined;
      }
      continue;
    }
    if (next === "'''" || next === '"""') {
      quote = next;
      i += 2;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")" && depth > 0) {
      depth -= 1;
    }
  }
  return { depth, quote };
}

function parseRole(
  lines: SourceLine[],
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): RoleDecl | undefined {
  const text = normalizeExpression(lines)
    .replace(/\s*\{\s*$/, "")
    .trim();
  const match = /^role\s+([A-Za-z_][A-Za-z0-9_]*)\s+when\s+(.+)$/.exec(text);
  if (!match) {
    diagnostics.push(error("INVALID_ROLE", `Invalid role declaration: ${text}`, file, lines[0]!));
    return undefined;
  }
  const metadata = parseMetadataEntries(body, file);
  const label = metadata.find((entry) => entry.key === "label")?.value;
  const labelValue = label ? parseMetadataLiteral(label) : undefined;
  const aliasesEntry = metadata.find((entry) => entry.key === "aliases");
  return {
    name: match[1]!,
    predicate: match[2]!.trim(),
    label: typeof labelValue === "string" ? labelValue : undefined,
    aliases: aliasesEntry ? parseMetadataStringArray(aliasesEntry.value) : [],
    metadata,
    location: location(file, lines[0]!.line, lines[0]!.text, "role"),
  };
}

function parseDefinitions(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): DefinitionDecl[] {
  const groups = groupDefinitionLines(lines);
  return groups.flatMap((group) => {
    const { headerLines, bodyLines } = splitDefinitionGroup(group);
    const header = headerLines[0]!;
    const text = normalizeExpression(headerLines)
      .replace(/\s*\{\s*$/, "")
      .trim();
    const modifiers = parseDefinitionModifiers(text);
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*::\s*([A-Za-z_][A-Za-z0-9_]*)(\?)?)?\s+is\s+(.+)$/.exec(
      modifiers.text,
    );
    if (!match) {
      diagnostics.push(error("INVALID_DEFINITION", `Invalid definition: ${text}`, file, group[0]!));
      return [];
    }
    const metadata = parseDescribedWriteMappings(bodyLines, file, diagnostics);
    return [
      {
        name: match[1]!,
        typeName: match[2],
        nullable: Boolean(match[3]),
        expression: match[4]!.trim(),
        description: metadata.description,
        writeable: modifiers.writeable,
        indexed: modifiers.indexed,
        writeMappings: metadata.writeMappings,
        location: location(file, header.line, header.text, match[1]),
      },
    ];
  });
}

function parseDefinitionModifiers(text: string): { text: string; writeable: boolean; indexed: boolean } {
  let remaining = text.trim();
  let writeable = false;
  let indexed = false;
  for (;;) {
    const match = /\s+(writeable|indexed)$/.exec(remaining);
    if (!match) break;
    if (match[1] === "writeable") writeable = true;
    if (match[1] === "indexed") indexed = true;
    remaining = remaining.slice(0, match.index).trim();
  }
  return { text: remaining, writeable, indexed };
}

function splitDefinitionGroup(group: SourceLine[]): { headerLines: SourceLine[]; bodyLines: SourceLine[] } {
  const braceIndex = group.findIndex((line) => line.stripped.includes("{"));
  if (braceIndex < 0) return { headerLines: group, bodyLines: [] };
  return {
    headerLines: group.slice(0, braceIndex + 1),
    bodyLines: group.slice(braceIndex + 1, group.at(-1)?.stripped.trim() === "}" ? -1 : undefined),
  };
}

function parseDescribedWriteMappings(
  lines: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): { description?: string; writeMappings: WriteMappingDecl[] } {
  const writeLines: SourceLine[] = [];
  let description: string | undefined;
  for (const line of lines) {
    const trimmed = line.stripped.trim();
    if (!trimmed || trimmed === "}") {
      writeLines.push(line);
      continue;
    }
    if (/^description:\s*/.test(trimmed)) {
      description = parseDescription(trimmed.replace(/^description:\s*/, ""));
      continue;
    }
    writeLines.push(line);
  }
  return { description, writeMappings: parseWriteMappings(writeLines, file, diagnostics) };
}

function parseMemberDescriptionOnly(
  lines: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): string | undefined {
  let description: string | undefined;
  for (const line of trimBlankEdges(lines)) {
    const trimmed = line.stripped.trim();
    if (!trimmed || trimmed === "}") continue;
    if (/^description:\s*/.test(trimmed)) {
      description = parseDescription(trimmed.replace(/^description:\s*/, ""));
      continue;
    }
    diagnostics.push(error("INVALID_MEMBER_METADATA", `Invalid member metadata: ${trimmed}`, file, line));
  }
  return description;
}

function parseWriteMappings(
  lines: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): WriteMappingDecl[] {
  const mappings: WriteMappingDecl[] = [];
  const trimmedLines = trimBlankEdges(lines);
  for (let i = 0; i < trimmedLines.length; i += 1) {
    const line = trimmedLines[i]!;
    const trimmed = line.stripped.trim();
    if (!trimmed || trimmed === "}") continue;
    const write = /^write:\s*(.*)$/.exec(trimmed);
    if (write) {
      const rest = write[1]!.trim();
      if (rest) {
        const parsed = parseWriteMappingLine(rest, line, file, diagnostics);
        if (parsed) mappings.push(parsed);
        continue;
      }
      while (i + 1 < trimmedLines.length) {
        const next = trimmedLines[i + 1]!;
        const nextTrimmed = next.stripped.trim();
        if (!nextTrimmed || nextTrimmed === "}") {
          i += 1;
          continue;
        }
        if (/^write:/.test(nextTrimmed)) break;
        const parsed = parseWriteMappingLine(nextTrimmed, next, file, diagnostics);
        if (parsed) mappings.push(parsed);
        i += 1;
      }
      continue;
    }
    const parsed = parseWriteMappingLine(trimmed, line, file, diagnostics);
    if (parsed) mappings.push(parsed);
  }
  return mappings;
}

function parseWriteMappingLine(
  text: string,
  line: SourceLine,
  file: string | undefined,
  diagnostics: Diagnostic[],
): WriteMappingDecl | undefined {
  const column = /^column\s+([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.+)$/.exec(text);
  if (column) {
    return {
      kind: "column",
      column: column[1]!,
      expression: column[2]!.trim(),
      location: location(file, line.line, line.text, "column"),
    };
  }
  const sql = /^sql\s+(['"])([\s\S]*)\1$/.exec(text);
  if (sql) {
    return {
      kind: "sql",
      sql: sql[2]!,
      location: location(file, line.line, line.text, "sql"),
    };
  }
  diagnostics.push(error("INVALID_WRITE_MAPPING", `Invalid write mapping: ${text}`, file, line));
  return undefined;
}

function parseAction(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): ActionDecl | undefined {
  const match = /^action\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_ACTION_DECL", "Invalid action declaration.", file, header));
    return undefined;
  }

  const action: ActionDecl = {
    name: match[1]!,
    params: [],
    guards: [],
    edits: [],
    logBlocks: [],
    effectBlocks: [],
    agentMetadata: [],
    location: location(file, header.line, header.text, "action"),
  };

  let i = 0;
  while (i < body.length) {
    i = parseActionMember(action, body, i, file, diagnostics);
  }

  return action;
}

function parseActionMember(
  action: ActionDecl,
  body: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
): number {
  const line = body[index]!;
  const trimmed = line.stripped.trim();
  if (!trimmed) return index + 1;

  if (/^description:\s*/.test(trimmed)) {
    action.description = parseDescription(trimmed.replace(/^description:\s*/, ""));
    return index + 1;
  }

  if (/^subject:/.test(trimmed)) {
    return parseActionSubjectMember(action, body, index, line, trimmed, file, diagnostics);
  }

  if (trimmed === "param:") {
    const collected = collectActionSection(body, index + 1);
    action.params.push(...parseActionParams(collected.lines, file, diagnostics));
    return collected.end;
  }

  if (isActionColonSectionHeader(trimmed, "guard")) {
    const first = trimmed === "guard:" ? [] : [{ ...line, stripped: line.stripped.replace(/^(\s*)guard:\s*/, "$1") }];
    const collected = collectActionSection(body, index + 1);
    action.guards.push(...parseActionGuards([...first, ...collected.lines], file));
    return collected.end;
  }

  if (isActionColonSectionHeader(trimmed, "edit")) {
    const first = trimmed === "edit:" ? [] : [{ ...line, stripped: line.stripped.replace(/^(\s*)edit:\s*/, "$1") }];
    const collected = collectActionSection(body, index + 1);
    action.edits.push(...parseActionEdits([...first, ...collected.lines], file, diagnostics));
    return collected.end;
  }

  if (/^log\b/.test(trimmed)) {
    const block = collectBraceBlock(body, index);
    diagnoseUnclosedBlock(block, file, diagnostics);
    action.logBlocks.push(parseActionMetadataBlock("log", block.header, block.body, file));
    return block.end;
  }

  if (/^effect\b/.test(trimmed)) {
    const collected = collectActionSection(body, index + 1);
    action.effectBlocks.push(parseActionMetadataBlock("effect", line, collected.lines, file));
    return collected.end;
  }

  if (isActionColonSectionHeader(trimmed, "agent")) {
    const first = trimmed === "agent:" ? [] : [{ ...line, stripped: line.stripped.replace(/^(\s*)agent:\s*/, "$1") }];
    const collected = collectActionSection(body, index + 1);
    const entries = parseMetadataEntries([...first, ...collected.lines], file);
    action.agentMetadata.push(...entries);
    action.agentBlock = {
      kind: "agent",
      header: "agent:",
      entries,
      lines: [...first, ...collected.lines].map((entry) => entry.stripped.trim()).filter(Boolean),
      location: location(file, line.line, line.text, "agent"),
    };
    return collected.end;
  }

  diagnostics.push(error("UNEXPECTED_ACTION_MEMBER", `Unexpected action member: ${trimmed}`, file, line));
  return index + 1;
}

function parseActionSubjectMember(
  action: ActionDecl,
  body: SourceLine[],
  index: number,
  line: SourceLine,
  trimmed: string,
  file: string | undefined,
  diagnostics: Diagnostic[],
): number {
  if (trimmed.includes("{")) {
    const block = collectBraceBlock(body, index);
    diagnoseUnclosedBlock(block, file, diagnostics);
    const subject = parseActionSubject(block.header, block.body, file);
    if (subject) action.subject = subject;
    return block.end;
  }
  const subject = parseActionSubject(line, [], file);
  if (subject) action.subject = subject;
  return index + 1;
}

function parseActionSubject(header: SourceLine, body: SourceLine[], file: string | undefined) {
  const match = /^subject:\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*\{)?$/.exec(header.stripped.trim());
  if (!match) return undefined;
  return {
    mode: match[1]!,
    metadata: parseMetadataEntries(body, file),
    location: location(file, header.line, header.text, "subject"),
  };
}

function parseActionParams(
  lines: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): ActionParamDecl[] {
  return trimBlankEdges(lines).flatMap((line) => {
    const trimmed = line.stripped.trim();
    if (!trimmed) return [];
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)(\?)?(.*)$/.exec(trimmed);
    if (!match) {
      diagnostics.push(error("INVALID_ACTION_PARAM", `Invalid action parameter: ${trimmed}`, file, line));
      return [];
    }
    const rest = match[4]!.trim();
    const hidden = /\bhidden\b/.test(rest);
    const defaultMatch = /\bdefault\s+(.+)$/.exec(rest.replace(/\bhidden\b/g, "").trim());
    return [
      {
        name: match[1]!,
        typeName: match[2]!,
        nullable: Boolean(match[3]),
        defaultExpression: defaultMatch?.[1]?.trim(),
        hidden,
        location: location(file, line.line, line.text, match[1]),
      },
    ];
  });
}

function parseActionGuards(lines: SourceLine[], file: string | undefined): ActionGuardDecl[] {
  const groups = groupActionExpressionLines(lines, (trimmed) => /^(else|and|or)\b/.test(trimmed));
  return groups
    .map((group) => {
      const expression = normalizeExpression(group);
      const elseMatch = /^(.*?)(?:\s+else\s+(.+))$/.exec(expression);
      return {
        predicate: (elseMatch ? elseMatch[1] : expression)!.trim(),
        elseMessage: elseMatch?.[2]?.trim(),
        location: location(file, group[0]!.line, group[0]!.text, group[0]!.stripped.trim()),
      };
    })
    .filter((guard) => guard.predicate);
}

function parseActionEdits(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): ActionEditDecl[] {
  const edits: ActionEditDecl[] = [];
  const trimmedLines = trimBlankEdges(lines);
  let i = 0;
  while (i < trimmedLines.length) {
    const line = trimmedLines[i]!;
    const trimmed = line.stripped.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    const set = /^set\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/.exec(trimmed);
    if (set) {
      edits.push({
        kind: "set",
        target: set[1]!,
        expression: set[2]!.trim(),
        location: location(file, line.line, line.text, "set"),
      });
      i += 1;
      continue;
    }
    if (trimmed === "delete") {
      edits.push({
        kind: "delete",
        location: location(file, line.line, line.text, "delete"),
      });
      i += 1;
      continue;
    }
    if (/^insert\s*\{/.test(trimmed)) {
      const block = collectBraceBlock(trimmedLines, i);
      diagnoseUnclosedBlock(block, file, diagnostics);
      edits.push({
        kind: "insert",
        assignments: parseInsertAssignments(block.body, file, diagnostics),
        location: location(file, line.line, line.text, "insert"),
      });
      i = block.end;
      continue;
    }
    diagnostics.push(error("INVALID_ACTION_EDIT", `Invalid action edit: ${trimmed}`, file, line));
    i += 1;
  }
  return edits;
}

function parseInsertAssignments(
  lines: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): ActionInsertAssignmentDecl[] {
  return trimBlankEdges(lines).flatMap((line) => {
    const trimmed = line.stripped.trim();
    if (!trimmed) return [];
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?::|=)\s*(.+)$/.exec(trimmed);
    if (!match) {
      diagnostics.push(error("INVALID_ACTION_EDIT", `Invalid insert assignment: ${trimmed}`, file, line));
      return [];
    }
    return [
      {
        target: match[1]!,
        expression: match[2]!.trim(),
        location: location(file, line.line, line.text, match[1]),
      },
    ];
  });
}

function parseActionMetadataBlock(
  kind: ActionMetadataBlockDecl["kind"],
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
): ActionMetadataBlockDecl {
  return {
    kind,
    header: header.stripped.trim(),
    entries: parseMetadataEntries(body, file),
    lines: trimBlankEdges(body)
      .map((line) => line.stripped.trim())
      .filter(Boolean),
    location: location(file, header.line, header.text, kind),
  };
}

function parseMetadataEntries(lines: SourceLine[], file: string | undefined): MetadataEntry[] {
  return trimBlankEdges(lines).flatMap((line) => {
    const trimmed = line.stripped.trim();
    if (!trimmed || trimmed === "}") return [];
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(trimmed);
    if (!match) return [];
    return [
      {
        key: match[1]!,
        value: match[2]!.trim(),
        location: location(file, line.line, line.text, match[1]),
      },
    ];
  });
}

function parseValidation(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): ValidationDecl | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_VALIDATION", "Invalid validation declaration.", file, header));
    return undefined;
  }
  const validation: ValidationDecl = { name: match[1]!, location: location(file, header.line, header.text, match[1]) };
  for (let i = 0; i < body.length; i += 1) {
    const line = body[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed.startsWith("description:")) validation.description = trimmed.replace(/^description:\s*/, "").trim();
    if (trimmed.startsWith("predicate:")) {
      const predicateLines = [line, ...body.slice(i + 1).filter((next) => next.stripped.trim() !== "")];
      predicateLines[0] = { ...line, stripped: line.stripped.replace(/^(\s*)predicate:\s*/, "$1") };
      validation.predicate = normalizeExpression(predicateLines);
      break;
    }
  }
  return validation;
}

function parseView(
  header: SourceLine,
  body: SourceLine[],
  file: string | undefined,
  diagnostics: Diagnostic[],
): ViewDecl | undefined {
  const match = /^view:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_VIEW", "Invalid view declaration.", file, header));
    return undefined;
  }
  return {
    name: match[1]!,
    body: parseQueryBody(body, file, diagnostics),
    location: location(file, header.line, header.text, "view"),
  };
}

function parseQueryBody(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): QueryBodyDecl {
  const body = emptyQueryBody();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }
    const next = parseQueryBodyMember(body, lines, i, file, diagnostics);
    if (next !== undefined) {
      i = next;
      continue;
    }
    diagnostics.push(error("UNEXPECTED_QUERY_MEMBER", `Unexpected query member: ${trimmed}`, file, line));
    i += 1;
  }
  return body;
}

function parseQueryBodyMember(
  body: QueryBodyDecl,
  lines: SourceLine[],
  index: number,
  file: string | undefined,
  diagnostics: Diagnostic[],
): number | undefined {
  const line = lines[index]!;
  const trimmed = line.stripped.trim();
  if (trimmed === "where:" || trimmed.startsWith("where: "))
    return parseQueryPredicate(body, "where", lines, index, file);
  if (trimmed === "having:" || trimmed.startsWith("having: "))
    return parseQueryPredicate(body, "having", lines, index, file);
  const limit = /^(limit|top):\s*(\d+)$/.exec(trimmed);
  if (limit) return parseQueryLimit(body, line, limit, index, file);
  if (queryItemSectionTargets.has(trimmed)) return parseQueryItemSection(body, trimmed, lines, index, file);
  if (trimmed !== "nest:") return undefined;
  const collected = collectQuerySection(lines, index + 1);
  body.nest?.push(...parseNestItems(collected.lines, file, diagnostics));
  return collected.end;
}

function parseQueryPredicate(
  body: QueryBodyDecl,
  key: "where" | "having",
  lines: SourceLine[],
  index: number,
  file: string | undefined,
): number {
  const line = lines[index]!;
  const first =
    line.stripped.trim() === `${key}:` ? undefined : line.stripped.replace(new RegExp(`^(\\s*)${key}:\\s*`), "$1");
  const startLines = first ? [{ ...line, stripped: first }] : [];
  const collected = collectQuerySection(lines, index + 1);
  body[key] = {
    expression: normalizeExpression([...startLines, ...collected.lines]),
    location: location(file, line.line, line.text, key),
  };
  return collected.end;
}

function parseQueryLimit(
  body: QueryBodyDecl,
  line: SourceLine,
  limit: RegExpExecArray,
  index: number,
  file: string | undefined,
): number {
  body.limit = {
    value: Number(limit[2]),
    location: location(file, line.line, line.text, limit[1]),
  };
  return index + 1;
}

const queryItemSectionTargets = new Map<
  string,
  keyof Pick<QueryBodyDecl, "select" | "groupBy" | "aggregate" | "calculate" | "orderBy" | "index">
>([
  ["select:", "select"],
  ["project:", "select"],
  ["group_by:", "groupBy"],
  ["aggregate:", "aggregate"],
  ["calculate:", "calculate"],
  ["order_by:", "orderBy"],
  ["index:", "index"],
] as const);

function parseQueryItemSection(
  body: QueryBodyDecl,
  section: string,
  lines: SourceLine[],
  index: number,
  file: string | undefined,
): number {
  const collected = collectQuerySection(lines, index + 1);
  const target = queryItemSectionTargets.get(section);
  body[target ?? "index"]?.push(...parseQueryItems(collected.lines, file));
  return collected.end;
}

function emptyQueryBody(): QueryBodyDecl {
  return { select: [], groupBy: [], aggregate: [], calculate: [], orderBy: [], nest: [], index: [] };
}

function parseQueryItems(lines: SourceLine[], file: string | undefined): QueryItemDecl[] {
  return groupQueryItemLines(lines).map((group) => {
    const text = normalizeExpression(group);
    const aliasMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(.+)$/.exec(text);
    return aliasMatch
      ? {
          alias: aliasMatch[1]!,
          expression: aliasMatch[2]!.trim(),
          location: location(file, group[0]!.line, group[0]!.text, aliasMatch[1]),
        }
      : { expression: text, location: location(file, group[0]!.line, group[0]!.text, group[0]!.stripped.trim()) };
  });
}

function parseNestItems(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): QueryNestDecl[] {
  const items: QueryNestDecl[] = [];
  const trimmed = trimBlankEdges(lines);
  let i = 0;
  while (i < trimmed.length) {
    const line = trimmed[i]!;
    const text = line.stripped.trim();
    const inlineMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+\{$/.exec(text);
    if (inlineMatch) {
      const block = collectBraceBlock(trimmed, i);
      diagnoseUnclosedBlock(block, file, diagnostics);
      items.push({
        name: inlineMatch[1]!,
        body: parseQueryBody(block.body, file, diagnostics),
        location: location(file, line.line, line.text, inlineMatch[1]),
      });
      i = block.end;
      continue;
    }
    const aliasMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(text);
    if (aliasMatch) {
      items.push({
        name: aliasMatch[1]!,
        view: aliasMatch[2]!,
        location: location(file, line.line, line.text, aliasMatch[1]),
      });
      i += 1;
      continue;
    }
    const viewMatch = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(text);
    if (viewMatch) {
      items.push({
        view: viewMatch[1]!,
        location: location(file, line.line, line.text, viewMatch[1]),
      });
      i += 1;
      continue;
    }
    diagnostics.push(error("INVALID_NEST", `Invalid nest item: ${text}`, file, line));
    i += 1;
  }
  return items;
}

function collectSection(lines: SourceLine[], start: number): { lines: SourceLine[]; end: number } {
  const collected: SourceLine[] = [];
  let i = start;
  let depth = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (depth === 0 && trimmed !== "" && startsConceptMemberDeclaration(trimmed)) break;
    collected.push(line);
    depth += countNetBraces(line.stripped);
    i += 1;
  }
  return { lines: collected, end: i };
}

function startsConceptMemberDeclaration(trimmed: string): boolean {
  return startsDeclaration(trimmed) || /^join_cross\b/.test(trimmed) || /^action\b/.test(trimmed);
}

function collectActionSection(lines: SourceLine[], start: number): { lines: SourceLine[]; end: number } {
  const collected: SourceLine[] = [];
  let i = start;
  let depth = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (depth === 0 && trimmed !== "" && startsActionMemberDeclaration(trimmed)) break;
    collected.push(line);
    depth += countNetBraces(line.stripped);
    i += 1;
  }
  return { lines: collected, end: i };
}

function startsActionMemberDeclaration(trimmed: string): boolean {
  return /^(description:|subject:|param:|guard:|edit:|log\b|effect\b|agent:|execute\b|declares_write:)/.test(trimmed);
}

type ActionColonSectionName = "guard" | "edit" | "agent";

function isActionColonSectionHeader(trimmed: string, section: ActionColonSectionName): boolean {
  return trimmed === `${section}:` || trimmed.startsWith(`${section}: `);
}

function collectQuerySection(lines: SourceLine[], start: number): { lines: SourceLine[]; end: number } {
  const collected: SourceLine[] = [];
  let i = start;
  let depth = 0;
  while (i < lines.length) {
    const trimmed = lines[i]!.stripped.trim();
    if (depth === 0 && trimmed !== "" && isQueryClauseStart(trimmed)) break;
    const line = lines[i]!;
    collected.push(line);
    depth += countNetBraces(line.stripped);
    i += 1;
  }
  return { lines: collected, end: i };
}

function isQueryClauseStart(trimmed: string): boolean {
  return /^(where:|having:|select:|project:|group_by:|aggregate:|calculate:|nest:|index:|order_by:|limit:|top:)/.test(
    trimmed,
  );
}

function collectContinuation(
  lines: SourceLine[],
  start: number,
  shouldContinue: (line: SourceLine) => boolean,
): { lines: SourceLine[]; end: number } {
  const collected = [lines[start]!];
  let i = start + 1;
  while (i < lines.length) {
    const trimmed = lines[i]!.stripped.trim();
    if (trimmed === "") {
      i += 1;
      break;
    }
    if (!shouldContinue(lines[i]!)) break;
    collected.push(lines[i]!);
    i += 1;
  }
  return { lines: collected, end: i };
}

function groupDefinitionLines(lines: SourceLine[]): SourceLine[][] {
  return groupByStarts(lines, (trimmed) =>
    /^[A-Za-z_][A-Za-z0-9_]*(?:\s*::\s*[A-Za-z_][A-Za-z0-9_]*\??)?\s+is\b/.test(trimmed),
  );
}

function groupQueryItemLines(lines: SourceLine[]): SourceLine[][] {
  return groupByStarts(
    lines,
    (trimmed) => /^[A-Za-z_][A-Za-z0-9_.]*(?:\s+is\b|\s*$)/.test(trimmed) && !/^(and|or|when|else|end)\b/.test(trimmed),
  );
}

function groupActionExpressionLines(lines: SourceLine[], isContinuation: (trimmed: string) => boolean): SourceLine[][] {
  const groups: SourceLine[][] = [];
  for (const line of trimBlankEdges(lines)) {
    const trimmed = line.stripped.trim();
    if (!trimmed) continue;
    if (groups.length === 0 || !isContinuation(trimmed)) groups.push([line]);
    else groups[groups.length - 1]!.push(line);
  }
  return groups;
}

function groupByStarts(lines: SourceLine[], isStart: (trimmed: string) => boolean): SourceLine[][] {
  const groups: SourceLine[][] = [];
  for (const line of trimBlankEdges(lines)) {
    const trimmed = line.stripped.trim();
    if (!trimmed) continue;
    if (isStart(trimmed) || groups.length === 0) groups.push([line]);
    else groups[groups.length - 1]!.push(line);
  }
  return groups;
}

function error(code: string, message: string, file: string | undefined, line: SourceLine): Diagnostic {
  return { severity: "error", code, message, location: location(file, line.line, line.text) };
}

function diagnoseUnclosedBlock(
  block: { header: SourceLine; unclosed: boolean },
  file: string | undefined,
  diagnostics: Diagnostic[],
) {
  if (!block.unclosed) return;
  diagnostics.push(
    error("UNCLOSED_BLOCK", `Unclosed block starting on line ${block.header.line}.`, file, block.header),
  );
}

export { primitiveTypes };
