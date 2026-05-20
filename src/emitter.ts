import { applyQueryLenses } from "./resolver.js";
import { buildRoleIndex, findRoleOnConcept, type RoleIndex, type RoleResolution } from "./roles.js";
import type {
  Diagnostic,
  JoinDecl,
  QueryBodyDecl,
  QueryDecl,
  QueryItemDecl,
  ResolvedConcept,
  SemanticModel,
  SourceDecl,
  SourceExpression,
  TemporalAxisDecl,
} from "./types.js";

export function emitMalloy(model: SemanticModel): { malloy: string; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const chunks: string[] = [];
  const sourceNames = new Map([...model.concepts].map(([name, concept]) => [name, concept.sourceName]));

  for (const source of [...model.sources.values()].filter((source) => !source.query)) {
    chunks.push(emitSourceDecl(model, source, sourceNames));
  }

  for (const concept of [...model.concepts.values()].filter((concept) => !conceptUsesQuerySource(model, concept))) {
    chunks.push(emitConcept(model, concept, sourceNames));
  }

  for (const source of [...model.sources.values()].filter((source) => source.query)) {
    chunks.push(emitSourceDecl(model, source, sourceNames));
  }

  for (const query of model.queries) {
    const queryModel = query.lenses.length > 0 ? applyQueryLenses(model, query, diagnostics) : model;
    if (!queryModel) continue;
    const names = new Map(
      [...queryModel.concepts].map(([name, concept]) => {
        const sourceName = query.lenses.length > 0 ? `${concept.sourceName}__${query.name}` : concept.sourceName;
        return [name, sourceName];
      }),
    );
    if (query.lenses.length > 0) {
      for (const concept of queryModel.concepts.values()) {
        chunks.push(emitConcept(queryModel, concept, names));
      }
    }
    const rootSource = names.get(query.root) ?? query.root;
    chunks.push(emitQuery(query, rootSource, queryModel, queryModel.concepts.get(query.root)));
  }

  for (const concept of [...model.concepts.values()].filter((concept) => conceptUsesQuerySource(model, concept))) {
    chunks.push(emitConcept(model, concept, sourceNames));
  }

  return { malloy: chunks.filter(Boolean).join("\n\n") + "\n", diagnostics };
}

function conceptUsesQuerySource(model: SemanticModel, concept: ResolvedConcept): boolean {
  const source = concept.source;
  if (source.kind !== "reference") return false;
  if (model.queries.some((query) => query.name === source.name)) return true;
  return Boolean(model.sources.get(source.name)?.query);
}

function emitConcept(model: SemanticModel, concept: ResolvedConcept, sourceNames: Map<string, string>): string {
  const sourceName = sourceNames.get(concept.name) ?? concept.sourceName;
  const lines: string[] = [];
  lines.push(`source: ${sourceName} is ${sourceExpr(model, concept.source, sourceNames)} extend {`);
  const compositePrimaryKeyName =
    concept.identities.length > 1 ? uniqueGeneratedFieldName(concept, "__semlang_primary_key") : undefined;
  if (concept.identities.length === 1) lines.push(`  primary_key: ${concept.identities[0]!.name}`);
  if (compositePrimaryKeyName) lines.push(`  primary_key: ${compositePrimaryKeyName}`);
  for (const join of concept.joins) {
    lines.push("");
    lines.push(...indent(emitJoin(model, concept, join, sourceNames), 2));
  }
  const dimensions = [
    ...(compositePrimaryKeyName
      ? [
          {
            name: compositePrimaryKeyName,
            expression: primaryKey(concept.identities),
            location: concept.identities[0]?.location ?? concept.location,
          },
        ]
      : []),
    ...concept.roles.map((role) => ({
      name: roleDimensionName(role.name),
      expression: lowerExpression(model, concept, role.predicate),
      location: role.location,
    })),
    ...concept.dimensions.map((dimension) => ({
      ...dimension,
      expression: lowerExpression(model, concept, dimension.expression),
    })),
  ];
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
      lines.push(
        ...emitDefinition(
          measure.name,
          lowerExpression(model, concept, measure.expression),
          4,
          formatAnnotation(model, concept, measure.expression),
        ),
      );
    }
  }
  for (const view of concept.views) {
    lines.push("");
    lines.push(...indent(emitView(view.name, view.body, model, concept), 2));
  }
  lines.push("}");
  return lines.join("\n");
}

function emitSourceDecl(model: SemanticModel, source: SourceDecl, sourceNames: Map<string, string>): string {
  const expression = sourceExpr(model, source.source, sourceNames);
  if (!source.query) return `source: ${source.name} is ${expression}`;
  const root = sourceExpressionConcept(model, source.source);
  const body = root ? emitQueryBody(source.query, model, root, 2) : emitRawQueryBody(source.query, 2);
  return [`source: ${source.name} is ${expression} -> {`, ...body, "}"].join("\n");
}

function emitJoin(
  model: SemanticModel,
  source: ResolvedConcept,
  join: JoinDecl,
  sourceNames: Map<string, string>,
): string[] {
  const roleIndex = buildRoleIndex(model);
  const targetRole = roleIndex.byQualifiedName.get(join.target) ?? roleIndex.byName.get(join.target);
  const targetConcept = model.concepts.get(join.target) ?? targetRole?.concept;
  const targetSource = targetConcept ? (sourceNames.get(targetConcept.name) ?? targetConcept.sourceName) : join.target;
  const lines = [`${join.kind}: ${join.name} is ${targetSource}`];
  if (join.with) {
    lines.push(`  with ${lowerExpression(model, source, join.with)}`);
    return lines;
  }
  const onParts = join.on ? [lowerJoinOn(model, source, targetConcept, join)] : [];
  if (join.at && targetConcept && onParts.length > 0) {
    const period = periodAxis(targetConcept.temporal.find((axis) => axis.axis === "valid_time"));
    if (period) {
      const at = lowerExpression(model, source, join.at);
      onParts.push(`${at} >= ${join.name}.${period.start}`);
      onParts.push(`${at} < ${join.name}.${period.end}`);
    }
  }
  const firstOn = onParts[0];
  if (firstOn) lines.push(`  on ${firstOn}`);
  for (const part of onParts.slice(1)) lines.push(`  and ${part}`);
  if (targetRole && onParts.length > 0) {
    lines.push(`  and ${prefixRolePredicate(model, targetRole.concept, targetRole.role.predicate, join.name)}`);
  }
  return lines;
}

function lowerJoinOn(
  model: SemanticModel,
  source: ResolvedConcept,
  target: ResolvedConcept | undefined,
  join: JoinDecl,
): string {
  const raw = lowerExpression(model, source, join.on ?? "");
  if (!target) return raw;
  if (!/[=\s<>]/.test(raw)) return `${raw} = ${join.name}.${raw}`;
  return raw.replace(/=\s*([A-Za-z_][A-Za-z0-9_]*)\b(?!\.)/g, (_match, field: string) => `= ${join.name}.${field}`);
}

function emitQuery(
  query: QueryDecl,
  rootSource: string,
  model: SemanticModel,
  root: ResolvedConcept | undefined,
): string {
  if (query.view) return `query: ${query.name} is ${rootSource} -> ${query.view}`;
  const body = root ? emitQueryBody(query.body, model, root, 2) : [];
  return [`query: ${query.name} is ${rootSource} -> {`, ...body, "}"].join("\n");
}

function emitView(name: string, body: QueryBodyDecl, model: SemanticModel, root: ResolvedConcept): string[] {
  return [`view: ${name} is {`, ...emitQueryBody(body, model, root, 2), "}"];
}

function emitQueryBody(
  body: QueryBodyDecl,
  model: SemanticModel,
  root: ResolvedConcept,
  indentSpaces: number,
): string[] {
  const lines: string[] = [];
  if (body.where) lines.push(`${spaces(indentSpaces)}where: ${lowerExpression(model, root, body.where.expression)}`);
  if (body.select.length > 0) {
    lines.push(`${spaces(indentSpaces)}select:`);
    for (const item of body.select) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  if (body.groupBy.length > 0) {
    lines.push(`${spaces(indentSpaces)}group_by:`);
    for (const item of body.groupBy) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  if (body.aggregate.length > 0) {
    lines.push(`${spaces(indentSpaces)}aggregate:`);
    for (const item of body.aggregate) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  if (body.having) lines.push(`${spaces(indentSpaces)}having: ${lowerExpression(model, root, body.having.expression)}`);
  if (body.calculate.length > 0) {
    lines.push(`${spaces(indentSpaces)}calculate:`);
    for (const item of body.calculate) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  if (body.nest && body.nest.length > 0) {
    lines.push(`${spaces(indentSpaces)}nest:`);
    for (const nest of body.nest) {
      if (nest.body) {
        lines.push(`${spaces(indentSpaces + 2)}${nest.name} is {`);
        lines.push(...emitQueryBody(nest.body, model, root, indentSpaces + 4));
        lines.push(`${spaces(indentSpaces + 2)}}`);
      } else if (nest.name && nest.view) {
        lines.push(`${spaces(indentSpaces + 2)}${nest.name} is ${nest.view}`);
      } else if (nest.view) {
        lines.push(`${spaces(indentSpaces + 2)}${nest.view}`);
      }
    }
  }
  if (body.index && body.index.length > 0) {
    lines.push(`${spaces(indentSpaces)}index:`);
    for (const item of body.index) lines.push(...emitQueryItem(item, model, root, indentSpaces + 2));
  }
  if (body.orderBy.length > 0) {
    lines.push(`${spaces(indentSpaces)}order_by:`);
    for (const item of body.orderBy)
      lines.push(`${spaces(indentSpaces + 2)}${lowerOrderByExpression(model, root, item.expression)}`);
  }
  if (body.limit) lines.push(`${spaces(indentSpaces)}limit: ${body.limit.value}`);
  return lines;
}

function emitQueryItem(
  item: QueryItemDecl,
  model: SemanticModel,
  root: ResolvedConcept,
  indentSpaces: number,
): string[] {
  const expression = lowerExpression(model, root, item.expression);
  return item.alias
    ? wrapDefinition(`${item.alias} is ${expression}`, indentSpaces)
    : [`${spaces(indentSpaces)}${expression}`];
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
  const roleIndex = buildRoleIndex(model);
  return expression.replace(
    /\b([A-Za-z_][A-Za-z0-9_.]*|this)\s+is\s+([A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)?)\b/g,
    (match, path: string, roleName: string) => {
      const resolution = resolveRoleTest(model, roleIndex, root, path, roleName);
      if (!resolution) return match;
      if (path === "this") return `(${lowerExpression(model, root, resolution.role.predicate)})`;
      return `(${prefixRolePredicate(model, resolution.concept, resolution.role.predicate, path)})`;
    },
  );
}

function lowerOrderByExpression(model: SemanticModel, root: ResolvedConcept, expression: string): string {
  const match = /^(.+?)(\s+(?:asc|desc))?$/i.exec(expression);
  if (!match) return lowerExpression(model, root, expression);
  return `${lowerExpression(model, root, match[1]!.trim())}${match[2] ?? ""}`;
}

function prefixRolePredicate(
  model: SemanticModel,
  concept: ResolvedConcept,
  predicate: string,
  prefix: string,
): string {
  let result = lowerExpression(model, concept, predicate);
  const members = new Set([
    ...concept.identities.map((field) => field.name),
    ...concept.fields.map((field) => field.name),
    ...concept.dimensions.map((field) => field.name),
    ...concept.measures.map((field) => field.name),
  ]);
  for (const member of [...members].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![.A-Za-z0-9_])${member}\\b`, "g"), `${prefix}.${member}`);
  }
  return result;
}

function sourceExpr(model: SemanticModel, source: SourceExpression, sourceNames: Map<string, string>): string {
  if (source.kind === "table" || source.kind === "sql") return source.expression;
  return (
    sourceNames.get(source.name) ??
    (model.sources.has(source.name) || model.queries.some((query) => query.name === source.name)
      ? source.name
      : source.expression)
  );
}

function sourceExpressionConcept(model: SemanticModel, source: SourceExpression): ResolvedConcept | undefined {
  return source.kind === "reference" ? model.concepts.get(source.name) : undefined;
}

function emitRawQueryBody(body: QueryBodyDecl, indentSpaces: number): string[] {
  const lines: string[] = [];
  if (body.where) lines.push(`${spaces(indentSpaces)}where: ${body.where.expression}`);
  if (body.select.length > 0) {
    lines.push(`${spaces(indentSpaces)}select:`);
    for (const item of body.select) lines.push(`${spaces(indentSpaces + 2)}${rawQueryItem(item)}`);
  }
  if (body.groupBy.length > 0) {
    lines.push(`${spaces(indentSpaces)}group_by:`);
    for (const item of body.groupBy) lines.push(`${spaces(indentSpaces + 2)}${rawQueryItem(item)}`);
  }
  if (body.aggregate.length > 0) {
    lines.push(`${spaces(indentSpaces)}aggregate:`);
    for (const item of body.aggregate) lines.push(`${spaces(indentSpaces + 2)}${rawQueryItem(item)}`);
  }
  if (body.having) lines.push(`${spaces(indentSpaces)}having: ${body.having.expression}`);
  if (body.calculate.length > 0) {
    lines.push(`${spaces(indentSpaces)}calculate:`);
    for (const item of body.calculate) lines.push(`${spaces(indentSpaces + 2)}${rawQueryItem(item)}`);
  }
  if (body.nest && body.nest.length > 0) {
    lines.push(`${spaces(indentSpaces)}nest:`);
    for (const nest of body.nest) {
      if (nest.body) {
        lines.push(`${spaces(indentSpaces + 2)}${nest.name} is {`);
        lines.push(...emitRawQueryBody(nest.body, indentSpaces + 4));
        lines.push(`${spaces(indentSpaces + 2)}}`);
      } else if (nest.name && nest.view) {
        lines.push(`${spaces(indentSpaces + 2)}${nest.name} is ${nest.view}`);
      } else if (nest.view) {
        lines.push(`${spaces(indentSpaces + 2)}${nest.view}`);
      }
    }
  }
  if (body.index && body.index.length > 0) {
    lines.push(`${spaces(indentSpaces)}index:`);
    for (const item of body.index) lines.push(`${spaces(indentSpaces + 2)}${rawQueryItem(item)}`);
  }
  if (body.orderBy.length > 0) {
    lines.push(`${spaces(indentSpaces)}order_by:`);
    for (const item of body.orderBy) lines.push(`${spaces(indentSpaces + 2)}${rawQueryItem(item)}`);
  }
  if (body.limit) lines.push(`${spaces(indentSpaces)}limit: ${body.limit.value}`);
  return lines;
}

function rawQueryItem(item: QueryItemDecl): string {
  return item.alias ? `${item.alias} is ${item.expression}` : item.expression;
}

function primaryKey(fields: Array<{ name: string }>): string {
  return `concat(${fields.map((field) => field.name).join(", '|', ")})`;
}

function uniqueGeneratedFieldName(concept: ResolvedConcept, baseName: string): string {
  const used = new Set([
    ...concept.fields.map((field) => field.name),
    ...concept.dimensions.map((dimension) => dimension.name),
    ...concept.measures.map((measure) => measure.name),
    ...concept.roles.map((role) => roleDimensionName(role.name)),
  ]);
  let name = baseName;
  let suffix = 2;
  while (used.has(name)) {
    name = `${baseName}_${suffix}`;
    suffix += 1;
  }
  return name;
}

function periodAxis(axis: TemporalAxisDecl | undefined): { start: string; end: string } | undefined {
  if (!axis) return undefined;
  const match = /^period\(([^,]+),\s*([^)]+)\)$/.exec(axis.expression);
  return match ? { start: match[1]!.trim(), end: match[2]!.trim() } : undefined;
}

function roleDimensionName(roleName: string): string {
  return `is_${roleName.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase()}`;
}

function resolveRoleTest(
  model: SemanticModel,
  roleIndex: RoleIndex,
  root: ResolvedConcept,
  path: string,
  roleName: string,
): RoleResolution | undefined {
  if (roleName.includes(".")) return roleIndex.byQualifiedName.get(roleName);
  const pathConcept = conceptForPath(model, roleIndex, root, path);
  return findRoleOnConcept(pathConcept, roleName) ?? roleIndex.byName.get(roleName);
}

function conceptForPath(
  model: SemanticModel,
  roleIndex: RoleIndex,
  root: ResolvedConcept,
  pathText: string,
): ResolvedConcept | undefined {
  if (pathText === "this") return root;
  const segments = pathText.split(".");
  let current: ResolvedConcept | undefined = root;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    if (!current) return undefined;
    if (i === 0 && (segment === current.name || segment === current.sourceName)) continue;
    const join: JoinDecl | undefined = current.joins.find((candidate) => candidate.name === segment);
    if (!join) return i === segments.length - 1 ? current : undefined;
    current =
      model.concepts.get(join.target) ??
      roleIndex.byQualifiedName.get(join.target)?.concept ??
      roleIndex.byName.get(join.target)?.concept;
  }
  return current;
}

function formatAnnotation(model: SemanticModel, concept: ResolvedConcept, expression: string): string | undefined {
  const amountField = [...concept.fields, ...concept.dimensions].find((field) => expression.includes(field.name));
  if (!amountField) return undefined;
  const type = model.types.get(amountField.typeName ?? "");
  const currency = type?.metadata
    .find((entry) => entry.key === "currency")
    ?.value.replace(/["']/g, "")
    .toLowerCase();
  return currency ? `# currency=${currency}2` : undefined;
}

function indent(lines: string[], count: number): string[] {
  return lines.map((line) => `${spaces(count)}${line}`);
}

function spaces(count: number): string {
  return " ".repeat(count);
}
