import { lexOntoql } from "./lexer.js";
import {
  collectBraceBlock,
  location,
  normalizeExpression,
  startsDeclaration,
  toLines,
  trimBlankEdges,
  type SourceLine
} from "./text.js";
import {
  emptyMembers,
  type CompileOptions,
  type ConceptDecl,
  type ConceptMembers,
  type DefinitionDecl,
  type Diagnostic,
  type FieldDecl,
  type IdentityField,
  type JoinDecl,
  type LensDecl,
  type OntoqlAst,
  type ParseResult,
  type QueryBodyDecl,
  type QueryDecl,
  type QueryItemDecl,
  type RefinementDecl,
  type SourceLocation,
  type TemporalAxisDecl,
  type TypeDecl,
  type ValidationDecl,
  type ViewDecl
} from "./types.js";

const primitiveTypes = new Set(["string", "number", "date", "timestamp", "currency", "boolean"]);

export function parseOntoql(source: string, options: CompileOptions = {}): ParseResult {
  const diagnostics: Diagnostic[] = [];
  const lexResult = lexOntoql(source);
  for (const error of lexResult.errors) {
    diagnostics.push({
      severity: "error",
      code: "LEX_ERROR",
      message: error.message,
      location: { file: options.filePath, line: error.line ?? 1, column: error.column ?? 1 }
    });
  }

  const lines = toLines(source);
  let packageName = "";
  let packageLoc: SourceLocation | undefined;
  const ast: OntoqlAst = {
    kind: "OntoqlAst",
    packageName,
    filePath: options.filePath,
    includes: [],
    types: [],
    concepts: [],
    lenses: [],
    queries: []
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }

    let match = /^package\s+([A-Za-z_][A-Za-z0-9_.]*)$/.exec(trimmed);
    if (match) {
      if (packageName) {
        diagnostics.push(error("DUPLICATE_PACKAGE", "Only one package declaration is allowed.", options.filePath, line));
      }
      packageName = match[1]!;
      packageLoc = location(options.filePath, line.line, line.text, "package");
      ast.packageName = packageName;
      ast.location = packageLoc;
      i += 1;
      continue;
    }

    match = /^include\s+["']([^"']+)["']$/.exec(trimmed);
    if (match) {
      ast.includes.push({ path: match[1]!, location: location(options.filePath, line.line, line.text, "include") });
      i += 1;
      continue;
    }

    if (/^type:/.test(trimmed)) {
      const block = collectBraceBlock(lines, i);
      const parsed = parseType(block.header, block.body, options.filePath, diagnostics);
      if (parsed) ast.types.push(parsed);
      i = block.end;
      continue;
    }

    if (/^concept\b/.test(trimmed)) {
      const block = collectBraceBlock(lines, i);
      const parsed = parseConcept(block.header, block.body, options.filePath, diagnostics);
      if (parsed) ast.concepts.push(parsed);
      i = block.end;
      continue;
    }

    if (/^lens:/.test(trimmed)) {
      const block = collectBraceBlock(lines, i);
      const parsed = parseLens(block.header, block.body, options.filePath, diagnostics);
      if (parsed) ast.lenses.push(parsed);
      i = block.end;
      continue;
    }

    if (/^query:/.test(trimmed)) {
      const block = collectBraceBlock(lines, i);
      const parsed = parseQuery(block.header, block.body, options.filePath, diagnostics);
      if (parsed) ast.queries.push(parsed);
      i = block.end;
      continue;
    }

    diagnostics.push(error("UNEXPECTED_TOP_LEVEL", `Unexpected top-level syntax: ${trimmed}`, options.filePath, line));
    i += 1;
  }

  if (!packageName) {
    diagnostics.push({
      severity: "error",
      code: "MISSING_PACKAGE",
      message: "OntoQL files must declare a package.",
      location: { file: options.filePath, line: 1, column: 1 }
    });
  }

  return { ast: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? undefined : ast, diagnostics };
}

function parseType(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): TypeDecl | undefined {
  const match = /^type:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_TYPE_DECL", "Invalid type declaration.", file, header));
    return undefined;
  }
  return {
    name: match[1]!,
    base: match[2]!,
    metadata: trimBlankEdges(body)
      .filter((line) => line.stripped.trim() !== "")
      .map((line) => {
        const [keyPart, ...valueParts] = line.stripped.trim().split(":");
        return {
          key: keyPart!.trim(),
          value: valueParts.join(":").trim(),
          location: location(file, line.line, line.text, keyPart)
        };
      }),
    location: location(file, header.line, header.text, "type")
  };
}

function parseConcept(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): ConceptDecl | undefined {
  const match = /^concept\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(?:(phase)\s+of\s+([A-Za-z_][A-Za-z0-9_]*)|(kind|event|situation|relator))\s+from\s+table\(["']([^"']+)["']\)\s*\{$/.exec(
    header.stripped.trim()
  );
  if (!match) {
    diagnostics.push(error("INVALID_CONCEPT_DECL", "Invalid concept declaration.", file, header));
    return undefined;
  }
  const members = parseConceptMembers(body, file, diagnostics);
  return {
    name: match[1]!,
    stereotype: (match[2] ? "phase" : match[4]) as ConceptDecl["stereotype"],
    phaseParent: match[3],
    table: match[5]!,
    location: location(file, header.line, header.text, "concept"),
    ...members
  };
}

function parseLens(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): LensDecl | undefined {
  const match = /^lens:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(?:(.*?)\s+extend\s+)?\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_LENS_DECL", "Invalid lens declaration.", file, header));
    return undefined;
  }
  const lens: LensDecl = {
    name: match[1]!,
    parents: match[2] ? match[2].split(",").map((part) => part.trim()).filter(Boolean) : [],
    types: [],
    refinements: [],
    location: location(file, header.line, header.text, "lens")
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
      const parsed = parseType(block.header, block.body, file, diagnostics);
      if (parsed) lens.types.push(parsed);
      i = block.end;
      continue;
    }
    if (/^refine:/.test(trimmed)) {
      const block = collectBraceBlock(body, i);
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

function parseRefinement(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): RefinementDecl | undefined {
  const match = /^refine:\s+([A-Za-z_][A-Za-z0-9_]*)\s+extend\s+\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_REFINEMENT", "Invalid refinement declaration.", file, header));
    return undefined;
  }
  return {
    conceptName: match[1]!,
    members: parseConceptMembers(body, file, diagnostics),
    location: location(file, header.line, header.text, "refine")
  };
}

function parseQuery(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): QueryDecl | undefined {
  const match = /^query:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+with\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*))?\s*->\s+\{$/.exec(
    header.stripped.trim()
  );
  if (!match) {
    diagnostics.push(error("INVALID_QUERY_DECL", "Invalid query declaration.", file, header));
    return undefined;
  }
  return {
    name: match[1]!,
    root: match[2]!,
    lenses: match[3] ? match[3].split(",").map((part) => part.trim()) : [],
    body: parseQueryBody(body, file, diagnostics),
    location: location(file, header.line, header.text, "query")
  };
}

function parseConceptMembers(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): ConceptMembers {
  const members = emptyMembers();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }

    if (/^identity\b/.test(trimmed)) {
      members.identities.push(...parseIdentityLine(line, file, diagnostics));
      i += 1;
      continue;
    }

    const temporal = /^(valid_time|occurrence_time|observation_time|recorded_time):\s*(.+)$/.exec(trimmed);
    if (temporal) {
      members.temporal.push({
        axis: temporal[1] as TemporalAxisDecl["axis"],
        expression: temporal[2]!.trim(),
        location: location(file, line.line, line.text, temporal[1])
      });
      i += 1;
      continue;
    }

    if (/^join_(one|many)\b/.test(trimmed)) {
      const collected = collectContinuation(lines, i, (next) => {
        const text = next.stripped.trim();
        return /^(on\b|and\b|at\b)/.test(text);
      });
      const parsed = parseJoin(collected.lines, file, diagnostics);
      if (parsed) members.joins.push(parsed);
      i = collected.end;
      continue;
    }

    if (/^role\b/.test(trimmed)) {
      const collected = collectContinuation(lines, i, (next) => next.stripped.trim().startsWith("when "));
      const parsed = parseRole(collected.lines, file, diagnostics);
      if (parsed) members.roles.push(parsed);
      i = collected.end;
      continue;
    }

    if (trimmed === "field:") {
      const collected = collectSection(lines, i + 1);
      members.fields.push(...parseFields(collected.lines, file, diagnostics));
      i = collected.end;
      continue;
    }

    if (trimmed === "dimension:" || trimmed === "measure:") {
      const collected = collectSection(lines, i + 1);
      const defs = parseDefinitions(collected.lines, file, diagnostics);
      if (trimmed === "dimension:") members.dimensions.push(...defs);
      else members.measures.push(...defs);
      i = collected.end;
      continue;
    }

    if (trimmed === "where:" || trimmed.startsWith("where: ")) {
      const first = trimmed === "where:" ? undefined : { ...line, stripped: line.stripped.replace(/^(\s*)where:\s*/, "$1") };
      const collected = collectSection(lines, i + 1);
      members.where.push({ expression: normalizeExpression(first ? [first, ...collected.lines] : collected.lines), location: location(file, line.line, line.text, "where") });
      i = collected.end;
      continue;
    }

    if (trimmed === "validation:") {
      i += 1;
      while (i < lines.length) {
        const validationLine = lines[i]!;
        if (validationLine.stripped.trim() === "") {
          i += 1;
          continue;
        }
        if (startsDeclaration(validationLine.stripped.trim())) break;
        const block = collectBraceBlock(lines, i);
        const parsed = parseValidation(block.header, block.body, file, diagnostics);
        if (parsed) members.validations.push(parsed);
        i = block.end;
      }
      continue;
    }

    if (/^view:/.test(trimmed)) {
      const block = collectBraceBlock(lines, i);
      const parsed = parseView(block.header, block.body, file, diagnostics);
      if (parsed) members.views.push(parsed);
      i = block.end;
      continue;
    }

    const description = /^description:\s*/.exec(trimmed);
    if (description) {
      i += 1;
      continue;
    }

    diagnostics.push(error("UNEXPECTED_CONCEPT_MEMBER", `Unexpected concept member: ${trimmed}`, file, line));
    i += 1;
  }
  return members;
}

function parseIdentityLine(line: SourceLine, file: string | undefined, diagnostics: Diagnostic[]): IdentityField[] {
  const rest = line.stripped.trim().replace(/^identity\s+/, "");
  return rest.split(",").map((part) => part.trim()).filter(Boolean).flatMap((part) => {
    const parsed = parseTypedName(part, line, file, diagnostics);
    return parsed ? [{ ...parsed, location: location(file, line.line, line.text, parsed.name) }] : [];
  });
}

function parseFields(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): FieldDecl[] {
  return trimBlankEdges(lines).flatMap((line) => {
    const trimmed = line.stripped.trim();
    if (!trimmed) return [];
    const unique = /\s+unique$/.test(trimmed);
    const withoutUnique = trimmed.replace(/\s+unique$/, "");
    const parsed = parseTypedName(withoutUnique, line, file, diagnostics);
    return parsed ? [{ ...parsed, unique, location: location(file, line.line, line.text, parsed.name) }] : [];
  });
}

function parseTypedName(text: string, line: SourceLine, file: string | undefined, diagnostics: Diagnostic[]): Omit<FieldDecl, "unique" | "location"> | undefined {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*::\s*([A-Za-z_][A-Za-z0-9_]*)(\?)?$/.exec(text.trim());
  if (!match) {
    diagnostics.push(error("INVALID_TYPED_NAME", `Invalid typed declaration: ${text.trim()}`, file, line));
    return undefined;
  }
  return { name: match[1]!, typeName: match[2]!, nullable: Boolean(match[3]) };
}

function parseJoin(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): JoinDecl | undefined {
  const text = normalizeExpression(lines);
  const match = /^(join_one|join_many)\s+([A-Za-z_][A-Za-z0-9_]*)(\?)?\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s+on\s+(.+?)(?:\s+at\s+(.+))?$/.exec(text);
  if (!match) {
    diagnostics.push(error("INVALID_JOIN", `Invalid join declaration: ${text}`, file, lines[0]!));
    return undefined;
  }
  return {
    kind: match[1] as JoinDecl["kind"],
    name: match[2]!,
    optional: Boolean(match[3]),
    target: match[4]!,
    on: match[5]!.trim(),
    at: match[6]?.trim(),
    location: location(file, lines[0]!.line, lines[0]!.text, match[1])
  };
}

function parseRole(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]) {
  const text = normalizeExpression(lines);
  const match = /^role\s+([A-Za-z_][A-Za-z0-9_]*)\s+when\s+(.+)$/.exec(text);
  if (!match) {
    diagnostics.push(error("INVALID_ROLE", `Invalid role declaration: ${text}`, file, lines[0]!));
    return undefined;
  }
  return { name: match[1]!, predicate: match[2]!.trim(), location: location(file, lines[0]!.line, lines[0]!.text, "role") };
}

function parseDefinitions(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): DefinitionDecl[] {
  const groups = groupDefinitionLines(lines);
  return groups.flatMap((group) => {
    const text = normalizeExpression(group);
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*::\s*([A-Za-z_][A-Za-z0-9_]*)(\?)?)?\s+is\s+(.+)$/.exec(text);
    if (!match) {
      diagnostics.push(error("INVALID_DEFINITION", `Invalid definition: ${text}`, file, group[0]!));
      return [];
    }
    return [{
      name: match[1]!,
      typeName: match[2],
      nullable: Boolean(match[3]),
      expression: match[4]!.trim(),
      location: location(file, group[0]!.line, group[0]!.text, match[1])
    }];
  });
}

function parseValidation(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): ValidationDecl | undefined {
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

function parseView(header: SourceLine, body: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): ViewDecl | undefined {
  const match = /^view:\s+([A-Za-z_][A-Za-z0-9_]*)\s+is\s+\{$/.exec(header.stripped.trim());
  if (!match) {
    diagnostics.push(error("INVALID_VIEW", "Invalid view declaration.", file, header));
    return undefined;
  }
  return {
    name: match[1]!,
    body: parseQueryBody(body, file, diagnostics),
    location: location(file, header.line, header.text, "view")
  };
}

function parseQueryBody(lines: SourceLine[], file: string | undefined, diagnostics: Diagnostic[]): QueryBodyDecl {
  const body: QueryBodyDecl = { groupBy: [], aggregate: [] };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.stripped.trim();
    if (trimmed === "") {
      i += 1;
      continue;
    }
    if (trimmed === "where:" || trimmed.startsWith("where: ")) {
      const first = trimmed === "where:" ? undefined : line.stripped.replace(/^(\s*)where:\s*/, "$1");
      const startLines = first ? [{ ...line, stripped: first }] : [];
      const collected = collectQuerySection(lines, i + 1);
      body.where = {
        expression: normalizeExpression([...startLines, ...collected.lines]),
        location: location(file, line.line, line.text, "where")
      };
      i = collected.end;
      continue;
    }
    if (trimmed === "group_by:" || trimmed === "aggregate:") {
      const collected = collectQuerySection(lines, i + 1);
      const items = parseQueryItems(collected.lines, file);
      if (trimmed === "group_by:") body.groupBy.push(...items);
      else body.aggregate.push(...items);
      i = collected.end;
      continue;
    }
    diagnostics.push(error("UNEXPECTED_QUERY_MEMBER", `Unexpected query member: ${trimmed}`, file, line));
    i += 1;
  }
  return body;
}

function parseQueryItems(lines: SourceLine[], file: string | undefined): QueryItemDecl[] {
  return groupQueryItemLines(lines).map((group) => {
    const text = normalizeExpression(group);
    const aliasMatch = /^([A-Za-z_][A-Za-z0-9_]*)\s+is\s+(.+)$/.exec(text);
    return aliasMatch
      ? { alias: aliasMatch[1]!, expression: aliasMatch[2]!.trim(), location: location(file, group[0]!.line, group[0]!.text, aliasMatch[1]) }
      : { expression: text, location: location(file, group[0]!.line, group[0]!.text, group[0]!.stripped.trim()) };
  });
}

function collectSection(lines: SourceLine[], start: number): { lines: SourceLine[]; end: number } {
  const collected: SourceLine[] = [];
  let i = start;
  while (i < lines.length) {
    const trimmed = lines[i]!.stripped.trim();
    if (trimmed !== "" && startsDeclaration(trimmed)) break;
    collected.push(lines[i]!);
    i += 1;
  }
  return { lines: collected, end: i };
}

function collectQuerySection(lines: SourceLine[], start: number): { lines: SourceLine[]; end: number } {
  const collected: SourceLine[] = [];
  let i = start;
  while (i < lines.length) {
    const trimmed = lines[i]!.stripped.trim();
    if (trimmed !== "" && /^(where:|group_by:|aggregate:)/.test(trimmed)) break;
    collected.push(lines[i]!);
    i += 1;
  }
  return { lines: collected, end: i };
}

function collectContinuation(lines: SourceLine[], start: number, shouldContinue: (line: SourceLine) => boolean): { lines: SourceLine[]; end: number } {
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
  return groupByStarts(lines, (trimmed) => /^[A-Za-z_][A-Za-z0-9_]*(?:\s*::\s*[A-Za-z_][A-Za-z0-9_]*\??)?\s+is\b/.test(trimmed));
}

function groupQueryItemLines(lines: SourceLine[]): SourceLine[][] {
  return groupByStarts(lines, (trimmed) => /^[A-Za-z_][A-Za-z0-9_.]*(?:\s+is\b|\s*$)/.test(trimmed) && !/^(and|or|when|else|end)\b/.test(trimmed));
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

export { primitiveTypes };
