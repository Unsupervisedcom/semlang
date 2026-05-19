import { applyQueryLenses } from "./resolver.js";
import type {
  CompileOptions,
  Diagnostic,
  JoinDecl,
  QueryBodyDecl,
  QueryDecl,
  QueryItemDecl,
  ResolvedConcept,
  SemanticModel,
  TemporalAxisDecl
} from "./types.js";

export function emitMalloy(model: SemanticModel, options: CompileOptions = {}): { malloy: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const chunks: string[] = [];
  const sourceNames = new Map([...model.concepts].map(([name, concept]) => [name, concept.sourceName]));

  for (const concept of model.concepts.values()) {
    chunks.push(emitConcept(model, concept, sourceNames, options));
  }

  for (const query of model.queries) {
    const queryModel = query.lenses.length > 0 ? applyQueryLenses(model, query, diagnostics) : model;
    if (!queryModel) continue;
    const names = new Map([...queryModel.concepts].map(([name, concept]) => {
      const sourceName = query.lenses.length > 0 ? `${concept.sourceName}__${query.name}` : concept.sourceName;
      return [name, sourceName];
    }));
    if (query.lenses.length > 0) {
      for (const concept of queryModel.concepts.values()) {
        chunks.push(emitConcept(queryModel, concept, names, options));
      }
    }
    const rootSource = names.get(query.root) ?? query.root;
    chunks.push(emitQuery(query, rootSource, queryModel, queryModel.concepts.get(query.root)));
  }

  return { malloy: chunks.filter(Boolean).join("\n\n") + "\n", diagnostics };
}

function emitConcept(model: SemanticModel, concept: ResolvedConcept, sourceNames: Map<string, string>, options: CompileOptions): string {
  const sourceName = sourceNames.get(concept.name) ?? concept.sourceName;
  const lines: string[] = [];
  lines.push(`source: ${sourceName} is ${tableExpr(concept.table, options.sourceMode)} extend {`);
  if (concept.identities.length > 0) lines.push(`  primary_key: ${primaryKey(concept.identities)}`);
  for (const join of concept.joins) {
    lines.push("");
    lines.push(...indent(emitJoin(model, concept, join, sourceNames), 2));
  }
  const dimensions = [...concept.roles.map((role) => ({
    name: roleDimensionName(role.name),
    expression: lowerExpression(model, concept, role.predicate),
    location: role.location
  })), ...concept.dimensions.map((dimension) => ({
    ...dimension,
    expression: lowerExpression(model, concept, dimension.expression)
  }))];
  if (concept.where.length > 0) {
    for (const where of concept.where) lines.push(`  where: ${lowerExpression(model, concept, where.expression)}`);
  }
  if (dimensions.length > 0) {
    lines.push("");
    lines.push("  dimension:");
    for (const dimension of dimensions) {
      lines.push(...emitDefinition(dimension.name, dimension.expression, 4));
    }
  }
  if (concept.measures.length > 0) {
    lines.push("");
    lines.push("  measure:");
    for (const measure of concept.measures) {
      lines.push(...emitDefinition(measure.name, lowerExpression(model, concept, measure.expression), 4, formatAnnotation(model, concept, measure.expression)));
    }
  }
  for (const view of concept.views) {
    lines.push("");
    lines.push(...indent(emitView(view.name, view.body, model, concept), 2));
  }
  lines.push("}");
  return lines.join("\n");
}

function emitJoin(model: SemanticModel, source: ResolvedConcept, join: JoinDecl, sourceNames: Map<string, string>): string[] {
  const targetConcept = model.concepts.get(join.target) ?? roleTarget(model, join.target);
  const targetSource = targetConcept ? sourceNames.get(targetConcept.name) ?? targetConcept.sourceName : join.target;
  const lines = [`${join.kind}: ${join.name} is ${targetSource}`];
  const onParts = [lowerJoinOn(model, source, targetConcept, join)];
  if (join.at && targetConcept) {
    const period = periodAxis(targetConcept.temporal.find((axis) => axis.axis === "valid_time"));
    if (period) {
      const at = lowerExpression(model, source, join.at);
      onParts.push(`${at} >= ${join.name}.${period.start}`);
      onParts.push(`${at} < ${join.name}.${period.end}`);
    }
  }
  lines.push(`  on ${onParts[0]}`);
  for (const part of onParts.slice(1)) lines.push(`  and ${part}`);
  if (targetConcept && targetConcept.name !== join.target) {
    const role = targetConcept.roles.find((candidate) => candidate.name === join.target);
    if (role) lines.push(`  and ${prefixRolePredicate(model, targetConcept, role.predicate, join.name)}`);
  }
  return lines;
}

function lowerJoinOn(model: SemanticModel, source: ResolvedConcept, target: ResolvedConcept | undefined, join: JoinDecl): string {
  const raw = lowerExpression(model, source, join.on);
  if (!target) return raw;
  if (!/[=\s<>]/.test(raw)) return `${raw} = ${join.name}.${raw}`;
  return raw.replace(/=\s*([A-Za-z_][A-Za-z0-9_]*)\b/g, (_match, field: string) => `= ${join.name}.${field}`);
}

function emitQuery(query: QueryDecl, rootSource: string, model: SemanticModel, root: ResolvedConcept | undefined): string {
  const body = root ? emitQueryBody(query.body, model, root, 2) : [];
  return [`query: ${query.name} is ${rootSource} -> {`, ...body, "}"].join("\n");
}

function emitView(name: string, body: QueryBodyDecl, model: SemanticModel, root: ResolvedConcept): string[] {
  return [`view: ${name} is {`, ...emitQueryBody(body, model, root, 2), "}"];
}

function emitQueryBody(body: QueryBodyDecl, model: SemanticModel, root: ResolvedConcept, indentSpaces: number): string[] {
  const lines: string[] = [];
  if (body.where) lines.push(`${spaces(indentSpaces)}where: ${lowerExpression(model, root, body.where.expression)}`);
  if (body.groupBy.length > 0) {
    lines.push(`${spaces(indentSpaces)}group_by:`);
    for (const item of body.groupBy) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  if (body.aggregate.length > 0) {
    lines.push(`${spaces(indentSpaces)}aggregate:`);
    for (const item of body.aggregate) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  return lines;
}

function emitQueryItem(item: QueryItemDecl, model: SemanticModel, root: ResolvedConcept, indentSpaces: number): string[] {
  const expression = lowerExpression(model, root, item.expression);
  return item.alias ? wrapDefinition(`${item.alias} is ${expression}`, indentSpaces) : [`${spaces(indentSpaces)}${expression}`];
}

function emitDefinition(name: string, expression: string, indentSpaces: number, annotation?: string): string[] {
  const lines: string[] = [];
  if (annotation) lines.push(`${spaces(indentSpaces)}${annotation}`);
  lines.push(...wrapDefinition(`${name} is ${expression}`, indentSpaces));
  return lines;
}

function wrapDefinition(text: string, indentSpaces: number): string[] {
  if (text.length <= 110) return [`${spaces(indentSpaces)}${text}`];
  const match = /^([A-Za-z_][A-Za-z0-9_]*\s+is)\s+(.+)$/.exec(text);
  if (!match) return [`${spaces(indentSpaces)}${text}`];
  return [`${spaces(indentSpaces)}${match[1]}`, `${spaces(indentSpaces + 2)}${match[2]}`];
}

export function lowerExpression(model: SemanticModel, root: ResolvedConcept, expression: string): string {
  let lowered = expression;
  for (const concept of model.concepts.values()) {
    for (const role of concept.roles) {
      const roleName = role.name;
      const pattern = new RegExp(`\\b([A-Za-z_][A-Za-z0-9_.]*|this)\\s+is\\s+${roleName}\\b`, "g");
      lowered = lowered.replace(pattern, (_match, path: string) => {
        if (path === "this") return `(${lowerExpression(model, root, role.predicate)})`;
        return `(${prefixRolePredicate(model, concept, role.predicate, path)})`;
      });
    }
  }
  return lowered;
}

function prefixRolePredicate(model: SemanticModel, concept: ResolvedConcept, predicate: string, prefix: string): string {
  let result = lowerExpression(model, concept, predicate);
  const members = new Set([
    ...concept.identities.map((field) => field.name),
    ...concept.fields.map((field) => field.name),
    ...concept.dimensions.map((field) => field.name),
    ...concept.measures.map((field) => field.name)
  ]);
  for (const member of [...members].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![.A-Za-z0-9_])${member}\\b`, "g"), `${prefix}.${member}`);
  }
  return result;
}

function tableExpr(table: string, sourceMode: CompileOptions["sourceMode"]): string {
  return sourceMode === "duckdb" ? `duckdb.table('${table}')` : `table('${table}')`;
}

function primaryKey(fields: Array<{ name: string }>): string {
  if (fields.length === 1) return fields[0]!.name;
  return `concat(${fields.map((field) => field.name).join(", '|', ")})`;
}

function periodAxis(axis: TemporalAxisDecl | undefined): { start: string; end: string } | undefined {
  if (!axis) return undefined;
  const match = /^period\(([^,]+),\s*([^)]+)\)$/.exec(axis.expression);
  return match ? { start: match[1]!.trim(), end: match[2]!.trim() } : undefined;
}

function roleTarget(model: SemanticModel, roleName: string): ResolvedConcept | undefined {
  for (const concept of model.concepts.values()) {
    if (concept.roles.some((role) => role.name === roleName)) return concept;
  }
  return undefined;
}

function roleDimensionName(roleName: string): string {
  return `is_${roleName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`;
}

function formatAnnotation(model: SemanticModel, concept: ResolvedConcept, expression: string): string | undefined {
  const amountField = [...concept.fields, ...concept.dimensions].find((field) => expression.includes(field.name));
  if (!amountField) return undefined;
  const type = model.types.get(amountField.typeName ?? "");
  const currency = type?.metadata.find((entry) => entry.key === "currency")?.value.replace(/["']/g, "").toLowerCase();
  return currency ? `# currency=${currency}2` : undefined;
}

function indent(lines: string[], count: number): string[] {
  return lines.map((line) => `${spaces(count)}${line}`);
}

function spaces(count: number): string {
  return " ".repeat(count);
}
