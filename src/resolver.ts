import path from "node:path";
import { parseOntoql } from "./parser.js";
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
  type TypeDecl
} from "./types.js";

const primitiveTypes = new Set(["string", "number", "date", "timestamp", "currency", "boolean"]);
const expressionKeywords = new Set([
  "and", "or", "not", "is", "null", "in", "case", "when", "then", "else", "end", "distinct",
  "date", "timestamp", "interval", "true", "false", "this"
]);
const aggregateFunctions = new Set(["sum", "avg", "count", "max", "min", "median"]);
const scalarFunctions = new Set(["concat", "nullif", "now", "period", "currency"]);
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
  for (const type of ast.types) {
    addUnique(model.types, type.name, type, diagnostics, "DUPLICATE_TYPE", `Duplicate type ${type.name}.`, type.location);
  }
  for (const concept of ast.concepts) {
    const resolved: ResolvedConcept = { ...concept, sourceName: concept.table, roleBaseNames: new Set(concept.roles.map((role) => role.name)) };
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
  }

  for (const concept of model.concepts.values()) {
    validateConceptMembers(model, roleIndex, concept, concept, diagnostics);
  }

  for (const lens of model.lenses.values()) {
    for (const parent of lens.parents) {
      if (!model.lenses.has(parent)) diagnostics.push({ severity: "error", code: "UNKNOWN_LENS", message: `Unknown parent lens ${parent}.`, location: lens.location });
    }
    for (const type of lens.types) {
      if (!primitiveTypes.has(type.base)) diagnostics.push({ severity: "error", code: "UNKNOWN_BASE_TYPE", message: `Unknown primitive type ${type.base}.`, location: type.location });
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
    validateQueryBody(queryModel, queryRoleIndex, root, query, diagnostics);
  }
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
    validateExpression(model, roleIndex, owningConcept, join.on, join.location, diagnostics, { allowUnknownBare: true });
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
}

function validatePathOrKnownAggregate(model: SemanticModel, roleIndex: Map<string, ResolvedConcept>, root: ResolvedConcept, expression: string, location: Diagnostic["location"], diagnostics: Diagnostic[]) {
  const name = lastSegment(expression);
  if (root.measures.some((measure) => measure.name === name)) return;
  validateExpression(model, roleIndex, root, expression, location, diagnostics, { allowUnknownBare: false });
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
    if (roleIndex.has(token) || aggregateFunctions.has(token) || scalarFunctions.has(token) || expressionKeywords.has(token)) continue;
    const resolution = resolvePath(model, roleIndex, root, token);
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

function expressionPaths(expression: string): string[] {
  const stripped = stripStrings(expression);
  const matches = stripped.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g) ?? [];
  return matches.filter((match, index, all) => {
    const lower = match.toLowerCase();
    if (expressionKeywords.has(lower) || aggregateFunctions.has(lower) || scalarFunctions.has(lower)) return false;
    if (primitiveTypes.has(lower)) return false;
    if (/^[A-Z]/.test(match) && all[index - 1] === "is") return false;
    return true;
  });
}

function roleTests(expression: string): string[] {
  return [...stripStrings(expression).matchAll(/\bis\s+([A-Z][A-Za-z0-9_]*)\b/g)].map((match) => match[1]!);
}

function stripStrings(expression: string): string {
  return expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, " ");
}

function checkDuplicate(seen: Set<string>, name: string, code: string, message: string, location: Diagnostic["location"], diagnostics: Diagnostic[]) {
  if (seen.has(name)) diagnostics.push({ severity: "error", code, message, location });
  seen.add(name);
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
    result = maskFunctionCalls(result, fn);
  }
  return result;
}

function maskFunctionCalls(expression: string, fn: string): string {
  const pattern = new RegExp(`\\b${fn}\\s*\\(`, "gi");
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
    result += expression.slice(last, start);
    result += " ".repeat(Math.max(0, i - start));
    last = i;
    pattern.lastIndex = i;
  }
  return result + expression.slice(last);
}

export function conceptMembersFromConcept(concept: ConceptDecl): ConceptMembers {
  const members = emptyMembers();
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
