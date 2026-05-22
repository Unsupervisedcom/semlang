/*
 * Purpose: Lowers a resolved SemLang semantic model into Malloy source and source-map diagnostics.
 * Encapsulation: Keep Malloy text generation and lowering conventions here; parsing, semantic validation, and runtime execution belong outside this module.
 */

import { applyQueryLenses } from "./resolver.js";
import { buildRoleIndex, findRoleOnConcept, type RoleIndex, type RoleResolution } from "./roles.js";
import {
  buildMalloy,
  indent,
  line,
  origin,
  spaces,
  type EmittedBlock,
  type MalloySourceOrigin,
} from "./malloy-writer.js";
import type {
  Diagnostic,
  JoinDecl,
  MalloySourceMapEntry,
  QueryBodyDecl,
  QueryDecl,
  QueryItemDecl,
  ResolvedConcept,
  SemanticModel,
  SourceDecl,
  SourceExpression,
  SourceLocation,
  TemporalAxisDecl,
} from "./types.js";

interface DefinitionToEmit {
  name: string;
  expression: string;
  location: SourceLocation;
}

interface QueryBodyEmitter {
  expression(expression: string): string;
  item(item: QueryItemDecl, indentSpaces: number): EmittedBlock;
  label(label: string): string;
  orderByItem(item: QueryItemDecl, indentSpaces: number): EmittedBlock;
}

export function emitMalloy(model: SemanticModel): {
  malloy: string;
  diagnostics: Diagnostic[];
  sourceMap: MalloySourceMapEntry[];
} {
  const diagnostics: Diagnostic[] = [];
  const chunks: EmittedBlock[] = [];
  const sourceNames = new Map([...model.concepts].map(([name, concept]) => [name, concept.sourceName]));
  const declaredSources = new Set<string>();

  for (const source of [...model.sources.values()].filter((source) => !source.query)) {
    chunks.push(emitSourceDecl(model, source, sourceNames));
    declaredSources.add(source.name);
  }

  const directConcepts = [...model.concepts.values()].filter((concept) => !conceptUsesQuerySource(model, concept));
  const directBaseSources = conceptBaseSourceNames(directConcepts);
  chunks.push(...emitConceptBaseSources(model, directConcepts, directBaseSources, sourceNames));

  for (const concept of directConcepts) {
    chunks.push(emitConcept(model, concept, sourceNames, declaredSources, directBaseSources));
    declaredSources.add(sourceNames.get(concept.name) ?? concept.sourceName);
  }

  for (const source of [...model.sources.values()].filter((source) => source.query)) {
    chunks.push(emitSourceDecl(model, source, sourceNames));
    declaredSources.add(source.name);
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
      const lensConcepts = [...queryModel.concepts.values()];
      const lensBaseSources = conceptBaseSourceNames(lensConcepts, names);
      chunks.push(...emitConceptBaseSources(queryModel, lensConcepts, lensBaseSources, names));
      const lensDeclaredSources = new Set(declaredSources);
      for (const concept of queryModel.concepts.values()) {
        chunks.push(emitConcept(queryModel, concept, names, lensDeclaredSources, lensBaseSources));
        lensDeclaredSources.add(names.get(concept.name) ?? concept.sourceName);
      }
    }
    const rootSource = names.get(query.root) ?? query.root;
    chunks.push(emitQuery(query, rootSource, queryModel, queryModel.concepts.get(query.root)));
  }

  for (const concept of [...model.concepts.values()].filter((concept) => conceptUsesQuerySource(model, concept))) {
    chunks.push(emitConcept(model, concept, sourceNames, declaredSources, directBaseSources));
    declaredSources.add(sourceNames.get(concept.name) ?? concept.sourceName);
  }

  return buildMalloy(chunks, diagnostics);
}

export function emitMalloyQuery(
  model: SemanticModel,
  query: QueryDecl,
): {
  malloy: string;
  diagnostics: Diagnostic[];
  sourceMap: MalloySourceMapEntry[];
} {
  const diagnostics: Diagnostic[] = [];
  const chunks: EmittedBlock[] = [];
  const queryModel = query.lenses.length > 0 ? applyQueryLenses(model, query, diagnostics) : model;
  if (!queryModel) return buildMalloy(chunks, diagnostics);
  const names = new Map(
    [...queryModel.concepts].map(([name, concept]) => {
      const sourceName = query.lenses.length > 0 ? `${concept.sourceName}__${query.name}` : concept.sourceName;
      return [name, sourceName];
    }),
  );
  if (query.lenses.length > 0) {
    const lensConcepts = [...queryModel.concepts.values()];
    const lensBaseSources = conceptBaseSourceNames(lensConcepts, names);
    chunks.push(...emitConceptBaseSources(queryModel, lensConcepts, lensBaseSources, names));
    const lensDeclaredSources = baseDeclaredSourceNames(model);
    for (const concept of queryModel.concepts.values()) {
      chunks.push(emitConcept(queryModel, concept, names, lensDeclaredSources, lensBaseSources));
      lensDeclaredSources.add(names.get(concept.name) ?? concept.sourceName);
    }
  }
  const rootSource = names.get(query.root) ?? query.root;
  chunks.push(emitQuery(query, rootSource, queryModel, queryModel.concepts.get(query.root)));
  return buildMalloy(chunks, diagnostics);
}

function baseDeclaredSourceNames(model: SemanticModel): Set<string> {
  return new Set([...model.sources.keys(), ...[...model.concepts.values()].map((concept) => concept.sourceName)]);
}

function conceptUsesQuerySource(model: SemanticModel, concept: ResolvedConcept): boolean {
  const source = concept.source;
  if (source.kind !== "reference") return false;
  if (model.queries.some((query) => query.name === source.name)) return true;
  return Boolean(model.sources.get(source.name)?.query);
}

function emitConcept(
  model: SemanticModel,
  concept: ResolvedConcept,
  sourceNames: Map<string, string>,
  declaredSources: Set<string>,
  baseSourceNames: Map<string, string>,
): EmittedBlock {
  const sourceName = sourceNames.get(concept.name) ?? concept.sourceName;
  const lines: EmittedBlock = [];
  const conceptOrigin = origin(concept.location, "concept", concept.name);
  lines.push(
    line(
      `source: ${sourceName} is ${baseSourceNames.get(concept.name) ?? sourceExpr(model, concept.source, sourceNames)} extend {`,
      conceptOrigin,
    ),
  );
  const compositePrimaryKeyName =
    concept.identities.length > 1 ? uniqueGeneratedFieldName(concept, "__semlang_primary_key") : undefined;
  if (concept.identities.length === 1) {
    const identity = concept.identities[0]!;
    lines.push(
      line(
        `  primary_key: ${identity.name}`,
        origin(identity.location, "identity", `${concept.name}.${identity.name}`),
      ),
    );
  }
  if (compositePrimaryKeyName) {
    lines.push(
      line(
        `  primary_key: ${compositePrimaryKeyName}`,
        origin(
          concept.identities[0]?.location ?? concept.location,
          "identity",
          `${concept.name}.${compositePrimaryKeyName}`,
        ),
      ),
    );
  }
  for (const join of concept.joins) {
    lines.push(line(""));
    lines.push(...indent(emitJoin(model, concept, join, sourceNames, declaredSources, baseSourceNames), 2));
  }
  const dimensions: DefinitionToEmit[] = [
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
    for (const where of concept.where) {
      lines.push(
        line(
          `  where: ${lowerExpression(model, concept, where.expression)}`,
          origin(where.location, "where", `${concept.name}.where`),
        ),
      );
    }
  }
  if (dimensions.length > 0) {
    lines.push(line(""));
    lines.push(line("  dimension:", conceptOrigin));
    for (const dimension of dimensions) {
      lines.push(
        ...emitDefinition(
          dimension.name,
          dimension.expression,
          4,
          origin(dimension.location, "dimension", `${concept.name}.${dimension.name}`),
        ),
      );
    }
  }
  if (concept.measures.length > 0) {
    lines.push(line(""));
    lines.push(line("  measure:", conceptOrigin));
    for (const measure of concept.measures) {
      lines.push(
        ...emitDefinition(
          measure.name,
          lowerExpression(model, concept, measure.expression),
          4,
          origin(measure.location, "measure", `${concept.name}.${measure.name}`),
          formatAnnotation(model, concept, measure.expression),
        ),
      );
    }
  }
  for (const view of concept.views) {
    lines.push(line(""));
    lines.push(...indent(emitView(view.name, view.body, model, concept), 2));
  }
  lines.push(line("}", conceptOrigin));
  return lines;
}

function conceptBaseSourceNames(
  concepts: ResolvedConcept[],
  sourceNames = new Map<string, string>(),
): Map<string, string> {
  return new Map(
    concepts.map((concept) => {
      const sourceName = sourceNames.get(concept.name) ?? concept.sourceName;
      return [concept.name, `__semlang_base_${sourceName}`];
    }),
  );
}

function emitConceptBaseSources(
  model: SemanticModel,
  concepts: ResolvedConcept[],
  baseSourceNames: Map<string, string>,
  sourceNames: Map<string, string>,
): EmittedBlock[] {
  const emitted = new Set<string>();
  const blocks: EmittedBlock[] = [];
  for (const concept of concepts) {
    const baseName = baseSourceNames.get(concept.name);
    if (!baseName || emitted.has(baseName)) continue;
    emitted.add(baseName);
    const conceptOrigin = origin(concept.location, "concept-base-source", concept.name);
    const primaryKeyName =
      concept.identities.length > 1
        ? uniqueGeneratedFieldName(concept, "__semlang_base_primary_key")
        : concept.identities[0]?.name;
    if (!primaryKeyName) {
      blocks.push([line(`source: ${baseName} is ${sourceExpr(model, concept.source, sourceNames)}`, conceptOrigin)]);
      continue;
    }
    const body: EmittedBlock = [
      line(`source: ${baseName} is ${sourceExpr(model, concept.source, sourceNames)} extend {`, conceptOrigin),
    ];
    if (concept.identities.length > 1) {
      const identityOrigin = origin(
        concept.identities[0]?.location ?? concept.location,
        "identity",
        `${concept.name}.${primaryKeyName}`,
      );
      body.push(line("  dimension:", conceptOrigin));
      body.push(line(`    ${primaryKeyName} is ${primaryKey(concept.identities)}`, identityOrigin));
      body.push(line(""));
    }
    body.push(
      line(
        `  primary_key: ${primaryKeyName}`,
        origin(concept.identities[0]?.location ?? concept.location, "identity", `${concept.name}.${primaryKeyName}`),
      ),
    );
    body.push(line("}", conceptOrigin));
    blocks.push(body);
  }
  return blocks;
}

function emitSourceDecl(model: SemanticModel, source: SourceDecl, sourceNames: Map<string, string>): EmittedBlock {
  const expression = sourceExpr(model, source.source, sourceNames);
  const sourceOrigin = origin(source.location, "source", source.name);
  if (!source.query) return [line(`source: ${source.name} is ${expression}`, sourceOrigin)];
  const root = sourceExpressionConcept(model, source.source);
  const body = emitQueryBody(source.query, root ? loweredQueryBodyEmitter(model, root) : rawQueryBodyEmitter(), 2);
  return [line(`source: ${source.name} is ${expression} -> {`, sourceOrigin), ...body, line("}", sourceOrigin)];
}

function emitJoin(
  model: SemanticModel,
  source: ResolvedConcept,
  join: JoinDecl,
  sourceNames: Map<string, string>,
  declaredSources: Set<string>,
  baseSourceNames: Map<string, string>,
): EmittedBlock {
  const roleIndex = buildRoleIndex(model);
  const targetRole = join.targetSource
    ? undefined
    : (roleIndex.byQualifiedName.get(join.target) ?? roleIndex.byName.get(join.target));
  const targetConcept = join.targetSource ? undefined : (model.concepts.get(join.target) ?? targetRole?.concept);
  const targetSource = join.targetSource
    ? sourceExpr(model, join.targetSource, sourceNames)
    : targetConcept
      ? joinTargetSource(targetConcept, sourceNames, declaredSources, baseSourceNames)
      : join.target;
  const joinOrigin = origin(join.location, "join", `${source.name}.${join.name}`);
  const lines = [line(`${join.kind}: ${join.name} is ${targetSource}`, joinOrigin)];
  if (join.with) {
    lines.push(line(`  with ${lowerExpression(model, source, join.with)}`, joinOrigin));
    return lines;
  }
  const onParts = join.on
    ? [lowerJoinOn(model, source, targetConcept, join, Boolean(join.targetSource || model.sources.has(join.target)))]
    : [];
  if (join.at && targetConcept && onParts.length > 0) {
    const period = periodAxis(targetConcept.temporal.find((axis) => axis.axis === "valid_time"));
    if (period) {
      const at = lowerExpression(model, source, join.at);
      onParts.push(`${at} >= ${join.name}.${period.start}`);
      onParts.push(`${at} < ${join.name}.${period.end}`);
    }
  }
  const firstOn = onParts[0];
  if (firstOn) lines.push(line(`  on ${firstOn}`, joinOrigin));
  for (const part of onParts.slice(1)) lines.push(line(`  and ${part}`, joinOrigin));
  if (targetRole && onParts.length > 0) {
    lines.push(
      line(`  and ${prefixRolePredicate(model, targetRole.concept, targetRole.role.predicate, join.name)}`, joinOrigin),
    );
  }
  return lines;
}

function joinTargetSource(
  targetConcept: ResolvedConcept,
  sourceNames: Map<string, string>,
  declaredSources: Set<string>,
  baseSourceNames: Map<string, string>,
): string {
  const finalSource = sourceNames.get(targetConcept.name) ?? targetConcept.sourceName;
  if (declaredSources.has(finalSource)) return finalSource;
  return baseSourceNames.get(targetConcept.name) ?? finalSource;
}

function lowerJoinOn(
  model: SemanticModel,
  source: ResolvedConcept,
  target: ResolvedConcept | undefined,
  join: JoinDecl,
  prefixBareRight = false,
): string {
  const raw = lowerExpression(model, source, join.on ?? "");
  if (!target && !prefixBareRight) return raw;
  if (!/[=\s<>]/.test(raw)) return `${raw} = ${join.name}.${raw}`;
  return raw.replace(/=\s*([A-Za-z_][A-Za-z0-9_]*)\b(?!\.)/g, (_match, field: string) => `= ${join.name}.${field}`);
}

function emitQuery(
  query: QueryDecl,
  rootSource: string,
  model: SemanticModel,
  root: ResolvedConcept | undefined,
): EmittedBlock {
  const queryOrigin = origin(query.location, "query", query.name);
  if (query.view) return [line(`query: ${query.name} is ${rootSource} -> ${query.view}`, queryOrigin)];
  const body = root ? emitQueryBody(query.body, loweredQueryBodyEmitter(model, root), 2) : [];
  return [line(`query: ${query.name} is ${rootSource} -> {`, queryOrigin), ...body, line("}", queryOrigin)];
}

function emitView(name: string, body: QueryBodyDecl, model: SemanticModel, root: ResolvedConcept): EmittedBlock {
  const view = root.views.find((candidate) => candidate.name === name);
  const viewOrigin = origin(view?.location ?? root.location, "view", `${root.name}.${name}`);
  return [
    line(`view: ${name} is {`, viewOrigin),
    ...emitQueryBody(body, loweredQueryBodyEmitter(model, root), 2),
    line("}", viewOrigin),
  ];
}

function emitQueryBody(body: QueryBodyDecl, emitter: QueryBodyEmitter, indentSpaces: number): EmittedBlock {
  const lines: EmittedBlock = [];
  if (body.where) {
    lines.push(
      line(
        `${spaces(indentSpaces)}where: ${emitter.expression(body.where.expression)}`,
        origin(body.where.location, "query-where", emitter.label("where")),
      ),
    );
  }
  emitQueryItemSection(lines, "select", body.select, emitter, indentSpaces);
  emitQueryItemSection(lines, "group_by", body.groupBy, emitter, indentSpaces);
  emitQueryItemSection(lines, "aggregate", body.aggregate, emitter, indentSpaces);
  if (body.having) {
    lines.push(
      line(
        `${spaces(indentSpaces)}having: ${emitter.expression(body.having.expression)}`,
        origin(body.having.location, "query-having", emitter.label("having")),
      ),
    );
  }
  emitQueryItemSection(lines, "calculate", body.calculate, emitter, indentSpaces);
  if (body.nest && body.nest.length > 0) {
    lines.push(line(`${spaces(indentSpaces)}nest:`));
    for (const nest of body.nest) {
      const nestOrigin = origin(nest.location, "query-nest", emitter.label(nest.name ?? nest.view ?? "nest"));
      if (nest.body) {
        lines.push(line(`${spaces(indentSpaces + 2)}${nest.name} is {`, nestOrigin));
        lines.push(...emitQueryBody(nest.body, emitter, indentSpaces + 4));
        lines.push(line(`${spaces(indentSpaces + 2)}}`, nestOrigin));
      } else if (nest.name && nest.view) {
        lines.push(line(`${spaces(indentSpaces + 2)}${nest.name} is ${nest.view}`, nestOrigin));
      } else if (nest.view) {
        lines.push(line(`${spaces(indentSpaces + 2)}${nest.view}`, nestOrigin));
      }
    }
  }
  emitQueryItemSection(lines, "index", body.index ?? [], emitter, indentSpaces);
  if (body.orderBy.length > 0) {
    lines.push(line(`${spaces(indentSpaces)}order_by:`));
    for (const item of body.orderBy) lines.push(...emitter.orderByItem(item, indentSpaces + 2));
  }
  if (body.limit) {
    lines.push(
      line(
        `${spaces(indentSpaces)}limit: ${body.limit.value}`,
        origin(body.limit.location, "query-limit", emitter.label("limit")),
      ),
    );
  }
  return lines;
}

function emitQueryItemSection(
  lines: EmittedBlock,
  sectionName: string,
  items: QueryItemDecl[],
  emitter: QueryBodyEmitter,
  indentSpaces: number,
): void {
  if (items.length === 0) return;
  lines.push(line(`${spaces(indentSpaces)}${sectionName}:`));
  for (const item of items) lines.push(...emitter.item(item, indentSpaces + 2));
}

function loweredQueryBodyEmitter(model: SemanticModel, root: ResolvedConcept): QueryBodyEmitter {
  return {
    expression: (expression) => lowerExpression(model, root, expression),
    item: (item, indentSpaces) => emitLoweredQueryItem(item, model, root, indentSpaces),
    label: (label) => `${root.name}.${label}`,
    orderByItem: (item, indentSpaces) => [
      line(
        `${spaces(indentSpaces)}${lowerOrderByExpression(model, root, item.expression)}`,
        origin(item.location, "query-order-by", `${root.name}.order_by`),
      ),
    ],
  };
}

function emitLoweredQueryItem(
  item: QueryItemDecl,
  model: SemanticModel,
  root: ResolvedConcept,
  indentSpaces: number,
): EmittedBlock {
  const expression = lowerExpression(model, root, item.expression);
  const itemOrigin = origin(item.location, "query-item", `${root.name}.${item.alias ?? item.expression}`);
  return item.alias
    ? wrapDefinition(`${item.alias} is ${expression}`, indentSpaces, itemOrigin)
    : [line(`${spaces(indentSpaces)}${expression}`, itemOrigin)];
}

function emitDefinition(
  name: string,
  expression: string,
  indentSpaces: number,
  definitionOrigin: MalloySourceOrigin,
  annotation?: string,
): EmittedBlock {
  const lines: EmittedBlock = [];
  if (annotation) lines.push(line(`${spaces(indentSpaces)}${annotation}`, definitionOrigin));
  lines.push(...wrapDefinition(`${name} is ${expression}`, indentSpaces, definitionOrigin));
  return lines;
}

function wrapDefinition(text: string, indentSpaces: number, lineOrigin: MalloySourceOrigin): EmittedBlock {
  if (text.length <= 110) return [line(`${spaces(indentSpaces)}${text}`, lineOrigin)];
  const match = /^([A-Za-z_][A-Za-z0-9_]*\s+is)\s+(.+)$/.exec(text);
  if (!match) return [line(`${spaces(indentSpaces)}${text}`, lineOrigin)];
  return [
    line(`${spaces(indentSpaces)}${match[1]}`, lineOrigin),
    line(`${spaces(indentSpaces + 2)}${match[2]}`, lineOrigin),
  ];
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

function rawQueryBodyEmitter(): QueryBodyEmitter {
  return {
    expression: (expression) => expression,
    item: emitRawQueryItem,
    label: (label) => label,
    orderByItem: emitRawOrderByItem,
  };
}

function emitRawQueryItem(item: QueryItemDecl, indentSpaces: number): EmittedBlock {
  return [
    line(
      `${spaces(indentSpaces)}${rawQueryItemText(item)}`,
      origin(item.location, "query-item", item.alias ?? item.expression),
    ),
  ];
}

function emitRawOrderByItem(item: QueryItemDecl, indentSpaces: number): EmittedBlock {
  return [
    line(
      `${spaces(indentSpaces)}${rawQueryItemText(item)}`,
      origin(item.location, "query-order-by", item.alias ?? item.expression),
    ),
  ];
}

function rawQueryItemText(item: QueryItemDecl): string {
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
