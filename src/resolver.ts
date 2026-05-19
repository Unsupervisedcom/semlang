import path from "node:path";
import { parseOntoql } from "./parser.js";
import { validateTypeMetadataEntry } from "./schema-metadata.js";
import {
  emptyMembers,
  type CompileOptions,
  type ConceptDecl,
  type ConceptMembers,
  type Diagnostic,
  type FieldDecl,
  type JoinDecl,
  type LensDecl,
  type OntoqlAst,
  type PackageLoader,
  type QueryDecl,
  type ResolveResult,
  type ResolvedConcept,
  type SemanticModel,
  type SourceExpression,
  type TypeDecl
} from "./types.js";

const primitiveTypes = new Set(["string", "number", "date", "timestamp", "currency", "boolean"]);
const expressionKeywords = new Set([
  "and", "or", "not", "is", "null", "in", "case", "when", "then", "else", "end", "distinct",
  "date", "timestamp", "interval", "true", "false", "this", "to", "f", "r"
]);
const aggregateFunctions = new Set(["sum", "avg", "count", "max", "min", "median", "stddev", "all", "exclude"]);
const analyticFunctions = new Set([
  "avg_moving", "first_value", "lag", "last_value", "lead", "max_cumulative", "max_window",
  "min_cumulative", "min_window", "rank", "row_number", "sum_cumulative", "sum_window",
  "dense_rank", "percent_rank"
]);
const scalarFunctions = new Set([
  "abs", "acos", "ascii", "asin", "atan", "atan2", "byte_length", "ceil", "chr", "coalesce",
  "cos", "concat", "currency", "day", "days", "day_of_week", "day_of_year", "div", "ends_with",
  "exp", "floor", "greatest", "hour", "hours", "ifnull", "is_inf", "is_nan", "least", "length",
  "ln", "log", "lower", "ltrim", "minute", "minutes", "month", "months", "now", "nullif",
  "period", "pi", "pow", "quarter", "quarters", "rand", "regexp_extract", "repeat", "replace",
  "round", "rtrim", "second", "seconds", "sign", "sin", "sqrt", "starts_with", "strpos",
  "substr", "tan", "trim", "trunc", "unicode", "upper", "week", "weeks", "year", "years"
]);
const scalarProperties = new Set(["date", "month", "week", "quarter", "year", "day"]);

export async function resolveOntoql(ast: OntoqlAst, options: CompileOptions = {}): Promise<ResolveResult> {
  const diagnostics: Diagnostic[] = [];
  const loaded = await loadAstGraph(ast, options.packageLoader, diagnostics, new Set());
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return { diagnostics };
  }

  const model: SemanticModel = {
    packageName: ast.packageName,
    files: loaded.map((item) => item.filePath).filter(Boolean) as string[],
    sources: new Map(),
    types: new Map(),
    concepts: new Map(),
    lenses: new Map(),
    queries: []
  };

  for (const loadedAst of loaded) {
    mergeAst(model, loadedAst, diagnostics);
  }
  validateModel(model, diagnostics);
  return diagnostics.some((diagnostic) => diagnostic.severity === "error") ? { diagnostics } : { model, diagnostics };
}

async function loadAstGraph(
  ast: OntoqlAst,
  loader: PackageLoader | undefined,
  diagnostics: Diagnostic[],
  seen: Set<string>,
  entryLocation: Diagnostic["location"] = ast.location
): Promise<OntoqlAst[]> {
  const key = ast.filePath ? path.resolve(ast.filePath) : ast.packageName;
  if (seen.has(key)) {
    diagnostics.push({ severity: "error", code: "INCLUDE_CYCLE", message: `Include cycle detected at ${key}.`, location: entryLocation });
    return [];
  }
  seen.add(key);
  const loaded: OntoqlAst[] = [];
  for (const include of ast.includes) {
    if (!loader) {
      diagnostics.push({ severity: "error", code: "MISSING_PACKAGE_LOADER", message: `Cannot load include ${include.path} without a package loader.`, location: include.location });
      continue;
    }
    const result = await loader.load(include.path, ast.filePath);
    const parsed = parseOntoql(result.source, { filePath: result.filePath });
    diagnostics.push(...parsed.diagnostics);
    if (parsed.ast) loaded.push(...await loadAstGraph(parsed.ast, loader, diagnostics, seen, include.location));
  }
  loaded.push(ast);
  seen.delete(key);
  return loaded;
}

function mergeAst(model: SemanticModel, ast: OntoqlAst, diagnostics: Diagnostic[]) {
  for (const source of ast.sources) {
    addUnique(model.sources, source.name, source, diagnostics, "DUPLICATE_SOURCE", `Duplicate source ${source.name}.`, source.location);
  }
  for (const type of ast.types) {
    addUnique(model.types, type.name, type, diagnostics, "DUPLICATE_TYPE", `Duplicate type ${type.name}.`, type.location);
  }
  for (const concept of ast.concepts) {
    const resolved: ResolvedConcept = { ...concept, sourceName: defaultConceptSourceName(concept), roleBaseNames: new Set(concept.roles.map((role) => role.name)) };
    addUnique(model.concepts, concept.name, resolved, diagnostics, "DUPLICATE_CONCEPT", `Duplicate concept ${concept.name}.`, concept.location);
  }
  for (const lens of ast.lenses) {
    addUnique(model.lenses, lens.name, lens, diagnostics, "DUPLICATE_LENS", `Duplicate lens ${lens.name}.`, lens.location);
  }
  for (const query of ast.queries) {
    if (model.queries.some((existing) => existing.name === query.name)) {
      diagnostics.push({ severity: "error", code: "DUPLICATE_QUERY", message: `Duplicate query ${query.name}.`, location: query.location });
    } else {
      model.queries.push(query);
    }
  }
}

function addUnique<T>(map: Map<string, T>, key: string, value: T, diagnostics: Diagnostic[], code: string, message: string, location: Diagnostic["location"]) {
  if (map.has(key)) diagnostics.push({ severity: "error", code, message, location });
  else map.set(key, value);
}

function validateModel(model: SemanticModel, diagnostics: Diagnostic[]) {
  const roleIndex = buildRoleIndex(model, diagnostics);

  for (const type of model.types.values()) {
    if (!primitiveTypes.has(type.base)) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_BASE_TYPE", message: `Unknown primitive type ${type.base}.`, location: type.location });
    }
    for (const entry of type.metadata) {
      const diagnostic = validateTypeMetadataEntry(entry);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }

  for (const concept of model.concepts.values()) {
    validateSourceExpression(model, concept.source, diagnostics);
    validateConceptMembers(model, roleIndex, concept, concept, diagnostics);
  }

  for (const source of model.sources.values()) {
    validateSourceExpression(model, source.source, diagnostics);
    if (source.query) {
      const root = sourceExpressionConcept(model, source.source);
      if (root) validateQueryBody(model, roleIndex, root, { name: source.name, location: source.location, body: source.query }, diagnostics);
    }
  }

  for (const lens of model.lenses.values()) {
    for (const parent of lens.parents) {
      if (!model.lenses.has(parent)) diagnostics.push({ severity: "error", code: "UNKNOWN_LENS", message: `Unknown parent lens ${parent}.`, location: lens.location });
    }
    for (const type of lens.types) {
      if (!primitiveTypes.has(type.base)) diagnostics.push({ severity: "error", code: "UNKNOWN_BASE_TYPE", message: `Unknown primitive type ${type.base}.`, location: type.location });
      for (const entry of type.metadata) {
        const diagnostic = validateTypeMetadataEntry(entry);
        if (diagnostic) diagnostics.push(diagnostic);
      }
    }
    for (const refinement of lens.refinements) {
      const target = model.concepts.get(refinement.conceptName);
      if (!target) {
        diagnostics.push({ severity: "error", code: "UNKNOWN_REFINEMENT_TARGET", message: `Lens ${lens.name} refines unknown concept ${refinement.conceptName}.`, location: refinement.location });
      }
    }
  }

  for (const query of model.queries) {
    const queryModel = applyQueryLenses(model, query, diagnostics);
    if (!queryModel) continue;
    const queryRoleIndex = buildRoleIndex(queryModel, diagnostics);
    for (const concept of queryModel.concepts.values()) {
      validateConceptMembers(queryModel, queryRoleIndex, concept, concept, diagnostics);
    }
    const root = queryModel.concepts.get(query.root);
    if (!root) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_QUERY_ROOT", message: `Query ${query.name} targets unknown concept ${query.root}.`, location: query.location });
      continue;
    }
    if (query.view && !root.views.some((view) => view.name === query.view)) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_VIEW", message: `Query ${query.name} targets unknown view ${query.view} on ${root.name}.`, location: query.location });
      continue;
    }
    validateQueryBody(queryModel, queryRoleIndex, root, query, diagnostics);
  }
}

function validateSourceExpression(model: SemanticModel, source: SourceExpression, diagnostics: Diagnostic[]) {
  if (source.kind !== "reference") return;
  const exists = model.sources.has(source.name)
    || model.concepts.has(source.name)
    || model.queries.some((query) => query.name === source.name);
  if (!exists) {
    diagnostics.push({
      severity: "error",
      code: "UNKNOWN_SOURCE",
      message: `Unknown source ${source.name}.`,
      location: source.location
    });
  }
}

function sourceExpressionConcept(model: SemanticModel, source: SourceExpression): ResolvedConcept | undefined {
  return source.kind === "reference" ? model.concepts.get(source.name) : undefined;
}

function validateConceptMembers(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, owningConcept: ResolvedConcept, concept: ConceptDecl, diagnostics: Diagnostic[]) {
  const seenFields = new Set<string>();
  const seenJoins = new Set<string>();
  const seenRoles = new Set<string>();
  const seenDimensions = new Set<string>();
  const seenMeasures = new Set<string>();
  const seenViews = new Set<string>();
  for (const field of [...concept.identities, ...concept.fields]) {
    if (!primitiveTypes.has(field.typeName) && !model.types.has(field.typeName)) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_TYPE", message: `Unknown type ${field.typeName}.`, location: field.location });
    }
    checkDuplicate(seenFields, field.name, "DUPLICATE_FIELD", `Duplicate field ${field.name} on ${owningConcept.name}.`, field.location, diagnostics);
  }
  for (const join of concept.joins) {
    checkDuplicate(seenJoins, join.name, "DUPLICATE_JOIN", `Duplicate join ${join.name} on ${owningConcept.name}.`, join.location, diagnostics);
    const target = model.concepts.get(join.target) ?? roleIndex.get(join.target);
    if (!target) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_JOIN_TARGET", message: `Join ${join.name} targets unknown concept or role ${join.target}.`, location: join.location });
      continue;
    }
    if (join.at && !target.temporal.some((axis) => axis.axis === "valid_time")) {
      diagnostics.push({ severity: "error", code: "INVALID_TEMPORAL_JOIN", message: `Join ${join.name} uses at but ${join.target} has no valid_time.`, location: join.location });
    }
    if (join.on) validateExpression(model, roleIndex, owningConcept, join.on, join.location, diagnostics, { allowUnknownBare: true });
    if (join.with) validateJoinWith(model, roleIndex, owningConcept, target, join, diagnostics);
    if (join.at) validateExpression(model, roleIndex, owningConcept, join.at, join.location, diagnostics, { allowUnknownBare: true });
  }
  for (const role of concept.roles) {
    checkDuplicate(seenRoles, role.name, "DUPLICATE_ROLE", `Duplicate role ${role.name} on ${owningConcept.name}.`, role.location, diagnostics);
    validateExpression(model, roleIndex, owningConcept, role.predicate, role.location, diagnostics, { allowUnknownBare: false });
  }
  for (const def of concept.dimensions) {
    checkDuplicate(seenDimensions, def.name, "DUPLICATE_DIMENSION", `Duplicate dimension ${def.name} on ${owningConcept.name}.`, def.location, diagnostics);
    if (def.typeName && !primitiveTypes.has(def.typeName) && !model.types.has(def.typeName)) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_TYPE", message: `Unknown type ${def.typeName}.`, location: def.location });
    }
    validateExpression(model, roleIndex, owningConcept, def.expression, def.location, diagnostics, { allowUnknownBare: true });
  }
  for (const def of concept.measures) {
    checkDuplicate(seenMeasures, def.name, "DUPLICATE_MEASURE", `Duplicate measure ${def.name} on ${owningConcept.name}.`, def.location, diagnostics);
    if (def.typeName && !primitiveTypes.has(def.typeName) && !model.types.has(def.typeName)) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_TYPE", message: `Unknown type ${def.typeName}.`, location: def.location });
    }
    validateExpression(model, roleIndex, owningConcept, def.expression, def.location, diagnostics, { allowUnknownBare: true });
  }
  for (const validation of concept.validations) {
    if (validation.predicate) validateExpression(model, roleIndex, owningConcept, validation.predicate, validation.location, diagnostics, { allowUnknownBare: false });
  }
  for (const where of concept.where) validateExpression(model, roleIndex, owningConcept, where.expression, where.location, diagnostics, { allowUnknownBare: false });
  for (const view of concept.views) {
    checkDuplicate(seenViews, view.name, "DUPLICATE_VIEW", `Duplicate view ${view.name} on ${owningConcept.name}.`, view.location, diagnostics);
    validateQueryBody(model, roleIndex, owningConcept, { name: view.name, location: view.location, body: view.body }, diagnostics);
  }
}

function validateQueryBody(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, root: ResolvedConcept, query: Pick<QueryDecl, "name" | "body" | "location">, diagnostics: Diagnostic[]) {
  if (query.body.where) validateExpression(model, roleIndex, root, query.body.where.expression, query.body.where.location, diagnostics, { allowUnknownBare: false });
  for (const select of query.body.select) validateExpression(model, roleIndex, root, select.expression, select.location, diagnostics, { allowUnknownBare: false });
  for (const group of query.body.groupBy) validateExpression(model, roleIndex, root, group.expression, group.location, diagnostics, { allowUnknownBare: false });

  const visibleAggregates = new Set(root.measures.map((measure) => measure.name));
  for (const aggregate of query.body.aggregate) {
    if (!aggregate.alias) {
      validatePathOrKnownAggregate(model, roleIndex, root, aggregate.expression, aggregate.location, diagnostics);
      visibleAggregates.add(lastSegment(aggregate.expression));
      continue;
    }
    validateExpression(model, roleIndex, root, aggregate.expression, aggregate.location, diagnostics, {
      allowUnknownBare: true,
      visibleAggregates
    });
    const raw = findRawFieldReference(model, root, aggregate.expression, visibleAggregates);
    if (raw) {
      diagnostics.push({
        severity: "error",
        code: "RAW_FIELD_IN_AGGREGATE_ALIAS",
        message: `Aggregate alias ${aggregate.alias} references raw row field ${raw} outside an aggregate function.`,
        location: aggregate.location
      });
    }
    visibleAggregates.add(aggregate.alias);
  }
  if (query.body.having) validateExpression(model, roleIndex, root, query.body.having.expression, query.body.having.location, diagnostics, {
    allowUnknownBare: true,
    visibleAggregates
  });
  for (const calculate of query.body.calculate) validateExpression(model, roleIndex, root, calculate.expression, calculate.location, diagnostics, {
    allowUnknownBare: true,
    visibleAggregates
  });
  for (const nest of query.body.nest ?? []) {
    if (nest.view && !root.views.some((view) => view.name === nest.view)) {
      diagnostics.push({
        severity: "error",
        code: "UNKNOWN_VIEW",
        message: `Nest references unknown view ${nest.view} on ${root.name}.`,
        location: nest.location
      });
    }
    if (nest.body) validateQueryBody(model, roleIndex, root, { name: nest.name ?? "nest", location: nest.location, body: nest.body }, diagnostics);
  }
  for (const item of query.body.index ?? []) validateExpression(model, roleIndex, root, item.expression, item.location, diagnostics, { allowUnknownBare: false });
  for (const order of query.body.orderBy) validateOrderBy(model, roleIndex, root, order, visibleAggregates, diagnostics);
}

function validateOrderBy(
  model: SemanticModel,
  roleIndex: Map<string, ResolvedConcept>,
  root: ResolvedConcept,
  order: { expression: string; location: Diagnostic["location"] },
  visibleAggregates: Set<string>,
  diagnostics: Diagnostic[]
) {
  const expression = order.expression.replace(/\s+(asc|desc)$/i, "").trim();
  validateExpression(model, roleIndex, root, expression, order.location, diagnostics, { allowUnknownBare: true, visibleAggregates });
}

function validatePathOrKnownAggregate(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, root: ResolvedConcept, expression: string, location: Diagnostic["location"], diagnostics: Diagnostic[]) {
  const name = lastSegment(expression);
  if (root.measures.some((measure) => measure.name === name)) return;
  validateExpression(model, roleIndex, root, expression, location, diagnostics, { allowUnknownBare: false });
}

function validateJoinWith(
  model: SemanticModel,
  roleIndex: Map<string, ResolvedConcept>,
  source: ResolvedConcept,
  target: ResolvedConcept,
  join: JoinDecl,
  diagnostics: Diagnostic[]
) {
  const expression = join.with!;
  validateExpression(model, roleIndex, source, expression, join.location, diagnostics, { allowUnknownBare: false });
  if (target.identities.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "JOIN_WITH_REQUIRES_IDENTITY",
      message: `Join ${join.name} uses with but ${join.target} has no identity.`,
      location: join.location
    });
    return;
  }
  if (target.identities.length !== 1) return;
  const sourceField = localField(source, expression);
  if (!sourceField) return;
  const targetIdentity = target.identities[0]!;
  if (!compatibleTypes(model, sourceField.typeName, targetIdentity.typeName)) {
    diagnostics.push({
      severity: "error",
      code: "JOIN_WITH_TYPE_MISMATCH",
      message: `Join ${join.name} with ${expression} has type ${sourceField.typeName}, but ${join.target}.${targetIdentity.name} has type ${targetIdentity.typeName}.`,
      location: join.location
    });
  }
}

function validateExpression(
  model: SemanticModel,
  roleIndex: Map<string, ResolvedConcept>,
  root: ResolvedConcept,
  expression: string,
  location: Diagnostic["location"],
  diagnostics: Diagnostic[],
  options: { allowUnknownBare: boolean; visibleAggregates?: Set<string> }
) {
  for (const roleName of roleTests(expression)) {
    if (!roleIndex.has(roleName)) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_ROLE", message: `Unknown role ${roleName}.`, location });
    }
  }
  for (const token of expressionPaths(expression)) {
    if (options.visibleAggregates?.has(token)) continue;
    if (roleIndex.has(token) || allowedFunction(token) || expressionKeywords.has(token)) continue;
    const resolution = resolveExpressionPath(model, roleIndex, root, token, expression);
    if (!resolution && !(options.allowUnknownBare && !token.includes("."))) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_PATH", message: `Unknown path ${token} from ${root.name}.`, location });
    }
  }
}

export function applyQueryLenses(model: SemanticModel, query: QueryDecl, diagnostics: Diagnostic[]): SemanticModel | undefined {
  const clone = cloneModel(model);
  const applied = new Set<string>();
  for (const lensName of query.lenses) {
    if (!applyLens(clone, lensName, diagnostics, applied, [], query.location)) return undefined;
  }
  return clone;
}

function applyLens(
  model: SemanticModel,
  lensName: string,
  diagnostics: Diagnostic[],
  applied: Set<string>,
  stack: string[],
  location?: Diagnostic["location"]
): boolean {
  if (applied.has(lensName)) return true;
  if (stack.includes(lensName)) {
    diagnostics.push({ severity: "error", code: "LENS_CYCLE", message: `Lens cycle detected: ${[...stack, lensName].join(" -> ")}.`, location });
    return false;
  }
  const lens = model.lenses.get(lensName);
  if (!lens) {
    diagnostics.push({ severity: "error", code: "UNKNOWN_LENS", message: `Unknown lens ${lensName}.`, location });
    return false;
  }
  for (const parent of lens.parents) {
    if (!applyLens(model, parent, diagnostics, applied, [...stack, lensName], lens.location)) return false;
  }
  for (const type of lens.types) {
    if (!model.types.has(type.name)) model.types.set(type.name, type);
  }
  for (const refinement of lens.refinements) {
    const concept = model.concepts.get(refinement.conceptName);
    if (!concept) {
      diagnostics.push({ severity: "error", code: "UNKNOWN_REFINEMENT_TARGET", message: `Lens ${lens.name} refines unknown concept ${refinement.conceptName}.`, location: refinement.location });
      return false;
    }
    mergeMembers(concept, refinement.members);
  }
  applied.add(lensName);
  return true;
}

function mergeMembers(concept: ResolvedConcept, members: ConceptMembers) {
  if (members.description) concept.description = members.description;
  concept.identities.push(...members.identities);
  concept.fields.push(...members.fields);
  concept.joins.push(...members.joins);
  concept.roles.push(...members.roles);
  concept.roleBaseNames = new Set(concept.roles.map((role) => role.name));
  concept.dimensions.push(...members.dimensions);
  concept.measures.push(...members.measures);
  concept.views.push(...members.views);
  concept.validations.push(...members.validations);
  concept.temporal.push(...members.temporal);
  concept.where.push(...members.where);
}

function cloneModel(model: SemanticModel): SemanticModel {
  return {
    packageName: model.packageName,
    files: [...model.files],
    sources: new Map(model.sources),
    types: new Map(model.types),
    lenses: new Map(model.lenses),
    queries: [...model.queries],
    concepts: new Map([...model.concepts].map(([name, concept]) => [name, cloneConcept(concept)]))
  };
}

function cloneConcept(concept: ResolvedConcept): ResolvedConcept {
  return {
    ...concept,
    identities: [...concept.identities],
    fields: [...concept.fields],
    joins: [...concept.joins],
    roles: [...concept.roles],
    dimensions: [...concept.dimensions],
    measures: [...concept.measures],
    views: [...concept.views],
    validations: [...concept.validations],
    temporal: [...concept.temporal],
    where: [...concept.where],
    roleBaseNames: new Set(concept.roleBaseNames)
  };
}

function buildRoleIndex(model: SemanticModel, diagnostics?: Diagnostic[]): Map<string, ResolvedConcept> {
  const index = new Map<string, ResolvedConcept>();
  for (const concept of model.concepts.values()) {
    for (const role of concept.roles) {
      const existing = index.get(role.name);
      if (existing && existing.name !== concept.name) {
        diagnostics?.push({
          severity: "error",
          code: "DUPLICATE_ROLE",
          message: `Duplicate global role ${role.name} on ${concept.name}; already declared on ${existing.name}.`,
          location: role.location
        });
        continue;
      }
      index.set(role.name, concept);
    }
  }
  return index;
}

function resolvePath(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, root: ResolvedConcept, pathText: string): boolean {
  if (/^\d/.test(pathText)) return true;
  const segments = pathText.split(".");
  let current: ResolvedConcept | undefined = root;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    if (i > 0 && scalarProperties.has(segment)) return true;
    if (!current) return false;
    const join: JoinDecl | undefined = current.joins.find((candidate) => candidate.name === segment);
    if (join) {
      current = model.concepts.get(join.target) ?? roleIndex.get(join.target);
      continue;
    }
    const hasMember = current.identities.some((field) => field.name === segment)
      || current.fields.some((field) => field.name === segment)
      || current.dimensions.some((field) => field.name === segment)
      || current.measures.some((field) => field.name === segment)
      || current.roles.some((role) => role.name === segment);
    if (!hasMember) return false;
    if (i < segments.length - 1) {
      if (scalarProperties.has(segments[i + 1]!)) return true;
      return false;
    }
  }
  return true;
}

function resolveExpressionPath(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, root: ResolvedConcept, pathText: string, expression: string): boolean {
  const segments = pathText.split(".");
  const last = segments.at(-1)?.toLowerCase();
  if (last && aggregateFunctions.has(last) && isMethodCall(expression, pathText)) {
    const relationPath = segments.slice(0, -1).join(".");
    return resolveAggregateLocalityPath(model, roleIndex, root, relationPath);
  }
  return resolvePath(model, roleIndex, root, pathText);
}

function resolveAggregateLocalityPath(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, root: ResolvedConcept, pathText: string): boolean {
  if (!pathText) return true;
  if (pathText === root.name || pathText === root.sourceName) return true;
  if (model.sources.has(pathText) || model.concepts.has(pathText)) return true;
  return resolvePath(model, roleIndex, root, pathText);
}

function isMethodCall(expression: string, pathText: string): boolean {
  return new RegExp(`${escapeRegExp(pathText)}\\s*\\(`).test(stripStrings(expression));
}

function expressionPaths(expression: string): string[] {
  const stripped = stripStrings(expression);
  const matches = stripped.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g) ?? [];
  return matches.filter((match, index, all) => {
    const lower = match.toLowerCase();
    const head = lower.split(".")[0]!;
    if (expressionKeywords.has(lower) || allowedFunction(lower)) return false;
    if (expressionKeywords.has(head) || allowedFunction(head)) return false;
    if (primitiveTypes.has(lower)) return false;
    if (/^[A-Z]/.test(match) && all[index - 1] === "is") return false;
    return true;
  });
}

function roleTests(expression: string): string[] {
  return [...stripStrings(expression).matchAll(/\bis\s+([A-Z][A-Za-z0-9_]*)\b/g)].map((match) => match[1]!);
}

function stripStrings(expression: string): string {
  return expression.replace(/(?:[fr])?'''[\s\S]*?'''|(?:[fr])?"""[\s\S]*?"""|(?:[fr])?`(?:[^`\\]|\\.)*`|(?:[fr])?'(?:[^'\\]|\\.)*'|(?:[fr])?"(?:[^"\\]|\\.)*"/gi, " ");
}

function checkDuplicate(seen: Set<string>, name: string, code: string, message: string, location: Diagnostic["location"], diagnostics: Diagnostic[]) {
  if (seen.has(name)) diagnostics.push({ severity: "error", code, message, location });
  seen.add(name);
}

function allowedFunction(name: string): boolean {
  return aggregateFunctions.has(name) || scalarFunctions.has(name) || analyticFunctions.has(name);
}

function localField(concept: ResolvedConcept, expression: string): { name: string; typeName: string } | undefined {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(expression)) return undefined;
  const field = [...concept.identities, ...concept.fields].find((candidate) => candidate.name === expression);
  return field ? { name: field.name, typeName: field.typeName } : undefined;
}

function compatibleTypes(model: SemanticModel, sourceType: string, targetType: string): boolean {
  return sourceType === targetType || typeBase(model, sourceType) === typeBase(model, targetType);
}

function typeBase(model: SemanticModel, typeName: string): string {
  return model.types.get(typeName)?.base ?? typeName;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lastSegment(pathText: string): string {
  return pathText.split(".").at(-1) ?? pathText;
}

function findRawFieldReference(model: SemanticModel, root: ResolvedConcept, expression: string, visibleAggregates: Set<string>): string | undefined {
  for (const token of expressionPaths(maskAggregateCalls(expression))) {
    if (visibleAggregates.has(token)) continue;
    if (root.fields.some((field) => field.name === token) || root.identities.some((field) => field.name === token)) return token;
    if (model.concepts.has(token)) continue;
  }
  return undefined;
}

function maskAggregateCalls(expression: string): string {
  let result = expression;
  for (const fn of aggregateFunctions) {
    result = maskFunctionCalls(result, new RegExp(`\\b[A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*\\.${fn}\\s*\\(`, "gi"));
    result = maskFunctionCalls(result, new RegExp(`\\b${fn}\\s*\\(`, "gi"));
  }
  return result;
}

function maskFunctionCalls(expression: string, pattern: RegExp): string {
  let result = "";
  let last = 0;
  for (let match = pattern.exec(expression); match; match = pattern.exec(expression)) {
    const start = match.index;
    let i = pattern.lastIndex;
    let depth = 1;
    let quote: "'" | '"' | undefined;
    while (i < expression.length && depth > 0) {
      const char = expression[i]!;
      const prev = expression[i - 1];
      if ((char === "'" || char === '"') && prev !== "\\") quote = quote === char ? undefined : quote ?? char;
      if (!quote && char === "(") depth += 1;
      if (!quote && char === ")") depth -= 1;
      i += 1;
    }
    i = skipFilteredAggregateBlock(expression, i);
    result += expression.slice(last, start);
    result += " ".repeat(Math.max(0, i - start));
    last = i;
    pattern.lastIndex = i;
  }
  return result + expression.slice(last);
}

function skipFilteredAggregateBlock(expression: string, start: number): number {
  let i = start;
  while (/\s/.test(expression[i] ?? "")) i += 1;
  if (expression[i] !== "{") return start;
  let depth = 0;
  let quote: "'" | '"' | "`" | undefined;
  while (i < expression.length) {
    const char = expression[i]!;
    const prev = expression[i - 1];
    if ((char === "'" || char === '"' || char === "`") && prev !== "\\") {
      quote = quote === char ? undefined : quote ?? char;
      i += 1;
      continue;
    }
    if (!quote && char === "{") depth += 1;
    if (!quote && char === "}") {
      depth -= 1;
      i += 1;
      if (depth === 0) return i;
      continue;
    }
    i += 1;
  }
  return start;
}

export function conceptMembersFromConcept(concept: ConceptDecl): ConceptMembers {
  const members = emptyMembers();
  members.description = concept.description;
  members.identities = concept.identities;
  members.fields = concept.fields;
  members.joins = concept.joins;
  members.roles = concept.roles;
  members.dimensions = concept.dimensions;
  members.measures = concept.measures;
  members.views = concept.views;
  members.validations = concept.validations;
  members.temporal = concept.temporal;
  members.where = concept.where;
  return members;
}

function defaultConceptSourceName(concept: ConceptDecl): string {
  if (concept.source.kind === "table") return sourceNameFromTablePath(concept.source.path);
  return toSnakeCase(concept.name);
}

function sourceNameFromTablePath(pathText: string): string {
  const withoutQuery = pathText.split(/[?#]/)[0] ?? pathText;
  const last = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1) ?? withoutQuery;
  const withoutExtension = last.replace(/\.[A-Za-z0-9]+$/, "");
  return sanitizeSourceName(withoutExtension || pathText);
}

function toSnakeCase(name: string): string {
  return sanitizeSourceName(name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase());
}

function sanitizeSourceName(name: string): string {
  const sanitized = name.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `source_${sanitized || "unnamed"}`;
}
