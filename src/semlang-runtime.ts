/*
 * Purpose: Defines the shared SemLang operation runtime, command registry, context lifecycle, and MCP adapter.
 * Encapsulation: Keep transport-neutral SemLang command behavior here; standalone MCP entry points and legacy module compatibility belong in tiny wrappers.
 */

import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type * as z from "zod/v4";
import { expressionIdentifiers } from "./expression-utils.js";
import { prepareFieldStatsCacheDirectory, resolveFieldStatsCacheDirectory } from "./field-stats-cache.js";
import { executeMalloySql, validateMalloyModel } from "./malloy-execution.js";
import { logTransaction } from "./logging.js";
import { compileMcpSource } from "./mcp-compilation.js";
import {
  inferProjectDir,
  isSyntheticMcpPath,
  projectDirDiscoveryCeiling,
  resolveMalloyExecutionContext,
  resolveSemLangMcpSettings,
  type ResolvedMalloyExecutionContext,
  type SemLangMcpSettings,
} from "./mcp-settings.js";
import { mcpToolDescriptions, mcpToolInputSchemas, mcpToolOrder, type McpToolName } from "./mcp-tool-manifest.js";
import {
  booleanValue,
  hasErrors,
  isRecord,
  jsonSafe,
  numberValue,
  resolved,
  resolveOptionalPath,
  stringList,
  stringValue,
  type JsonValue,
} from "./mcp-utils.js";
import {
  conceptMembersSearchText,
  conceptSearchItems,
  memberSearchItems,
  queryBodySearchText,
  scored,
  tokenize,
} from "./model-search.js";
import { QueryExecution } from "./query-execution.js";
import { applyQueryLenses } from "./resolver.js";
import { qualifiedRoleName } from "./roles.js";
import { loadSemLangConfig, type ResolvedSemLangConfig } from "./semlang-config.js";
import { getSemLangVersion } from "./version.js";
import type {
  ActionDecl,
  ActionEditDecl,
  CompileResult,
  Diagnostic,
  JoinDecl,
  LensDecl,
  MalloySourceMapEntry,
  QueryBodyDecl,
  QueryDecl,
  ResolvedConcept,
  SemanticModel,
  SourceExpression,
} from "./types.js";

export { prettyJsonLineCount } from "./mcp-utils.js";
export type { JsonValue } from "./mcp-utils.js";
export { resolveSemLangMcpSettings } from "./mcp-settings.js";
export type { ResolvedMalloyExecutionContext, SemLangMcpSettings } from "./mcp-settings.js";
export type SemLangMcpTool = (args?: Record<string, unknown>) => Promise<Record<string, JsonValue>>;
export interface SemLangCommand {
  execute: SemLangMcpTool;
}

export type SemLangCommandRegistry = Record<McpToolName, SemLangCommand>;

export function toolsFromCommands(commands: SemLangCommandRegistry): Record<McpToolName, SemLangMcpTool> {
  return Object.fromEntries(mcpToolOrder.map((name) => [name, (args) => commands[name].execute(args)])) as Record<
    McpToolName,
    SemLangMcpTool
  >;
}

const execFileAsync = promisify(execFile);

export interface SemLangMcpContext {
  compileResult?: CompileResult;
  model?: SemanticModel;
  malloy?: string;
  malloySourceMap?: MalloySourceMapEntry[];
  sourceText?: string;
  filePath?: string;
  sourcePaths?: string[];
  sourceKind?: "file" | "files" | "inline";
  projectDir?: string;
  malloyConfigPath?: string;
  malloyConfigSource?: "explicit" | "discovered";
  semlangConfig?: ResolvedSemLangConfig;
  exportDirectory?: string;
  duckDb?: ExampleDuckDbContext;
  fieldStats?: FieldStatsIndex;
  statsStatus?: StatsRefreshStatus;
  settings: SemLangMcpSettings;
}

export interface SemLangMcpApi {
  tools: Record<string, SemLangMcpTool>;
  toolDescriptions: Record<string, string>;
  toolInputSchemas: Record<string, z.ZodType>;
  getContext(): SemLangMcpContext;
}

type QueryLimitSecondsResult = { ok: true; value: number } | { ok: false; error: string };
type QueryLimitSecondsOptions =
  | { required: true; toolName: string; invalidErrorPrefix?: string }
  | { required: false; defaultValue: number; toolName: string; invalidErrorPrefix?: string };

interface ExampleDuckDbContext {
  sourceDir: string;
  dbPath: string;
  schemaPath: string;
}

type IndexedMemberKind = "field" | "dimension" | "measure";

interface IndexedMemberRef {
  concept: string;
  member: string;
  memberKind: IndexedMemberKind;
  expression: string;
  typeName?: string;
}

interface FieldStatsValue {
  value: JsonValue;
  count?: number;
}

interface FieldStatsEntry {
  concept: string;
  member: string;
  memberKind: IndexedMemberKind;
  expression: string;
  typeName?: string | null;
  updatedAt: string;
  cacheKey: string;
  rowCount?: number;
  nonNullCount?: number;
  nullCount?: number;
  distinctCount?: number;
  min?: JsonValue;
  max?: JsonValue;
  values?: {
    kind: "complete" | "sample";
    values: FieldStatsValue[];
    completeValueMaxDistinctCount: number;
    sampleValueMaxCount: number;
  };
  measureValue?: JsonValue;
  executionTimeMs?: number;
}

type FieldStatsIndex = Map<string, FieldStatsEntry>;

interface StatsRefreshStatus {
  enabled: boolean;
  cacheDirectory: string;
  updated: number;
  cached: number;
  failed: number;
  skipped: number;
  warnings: string[];
}

type LensModelResult =
  | { ok: true; model: SemanticModel; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: JsonValue; error: string };

const maxSearchResults = 20;
const defaultActionQueryLimitSeconds = 30;
const maxQueryLimitSeconds = Math.floor(2_147_483_647 / 1000);

type SourceRequest =
  | {
      ok: true;
      compileArgs: Record<string, unknown>;
      requestedProjectDir?: string;
      malloyConfigPath?: string;
      semlangConfig?: ResolvedSemLangConfig;
    }
  | { ok: false; response: Record<string, JsonValue> };

type LoadedMcpSource = Extract<Awaited<ReturnType<typeof compileMcpSource>>, { ok: true }>;
type LoadedSourceRequest = Extract<SourceRequest, { ok: true }>;
type LoadedSourceContext =
  | {
      ok: true;
      projectDir?: string;
      executionContext?: Extract<ResolvedMalloyExecutionContext, { ok: true }>;
    }
  | { ok: false; response: Record<string, JsonValue> };

interface SourceRequestInputs {
  paths: string[];
  inlineSource?: string;
  requestedProjectDir?: string;
}

async function sourceRequestFromArgs(
  args: Record<string, unknown>,
  settings: SemLangMcpSettings,
): Promise<SourceRequest> {
  const inputs = sourceRequestInputs(args);
  let paths = inputs.paths;
  const { inlineSource, requestedProjectDir } = inputs;
  let semlangConfig: ResolvedSemLangConfig | undefined;
  if (paths.length === 0 && !inlineSource) {
    const loadedConfig = await loadSemLangConfig(requestedProjectDir ?? settings.projectDir);
    if (!loadedConfig.ok) return { ok: false, response: { ok: false, error: loadedConfig.error } };
    semlangConfig = loadedConfig.resolved;
    paths = [semlangConfig.ontologyPath];
  }
  return {
    ok: true,
    compileArgs: compileArgsForSourceRequest(args, paths),
    requestedProjectDir,
    malloyConfigPath: sourceRequestMalloyConfigPath(args, semlangConfig, settings),
    semlangConfig,
  };
}

function sourceRequestInputs(args: Record<string, unknown>): SourceRequestInputs {
  const paths = stringList(args.paths ?? args.path ?? args.filePaths ?? args.filePath);
  const inlineSources = stringList(args.sources ?? args.source);
  return {
    paths,
    inlineSource: inlineSources.length > 0 ? inlineSources.join("\n\n") : undefined,
    requestedProjectDir: resolveOptionalPath(
      stringValue(args.projectDir ?? args.project_dir ?? args.projectPath ?? args.project_path),
    ),
  };
}

function compileArgsForSourceRequest(args: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  if (paths.length === 0) return args;
  const { paths: _paths, path: _path, filePaths: _filePaths, filePath: _filePath, ...compileArgs } = args;
  return { ...compileArgs, path: paths };
}

function sourceRequestMalloyConfigPath(
  args: Record<string, unknown>,
  semlangConfig: ResolvedSemLangConfig | undefined,
  settings: SemLangMcpSettings,
): string | undefined {
  return (
    stringValue(args.malloyConfigPath ?? args.malloy_config_path ?? args.configPath ?? args.config_path) ??
    semlangConfig?.malloyConfigPath ??
    settings.malloyConfigPath
  );
}

async function resolveLoadedSourceContext(
  compiledSource: LoadedMcpSource,
  sourceRequest: LoadedSourceRequest,
  settings: SemLangMcpSettings,
): Promise<LoadedSourceContext> {
  const model = compiledSource.result.model;
  if (!model) return { ok: true, projectDir: sourceRequest.semlangConfig?.projectDir };

  const explicitProjectDir = projectDirDiscoveryCeiling(
    compiledSource.sourcePaths,
    model.files,
    sourceRequest.requestedProjectDir ?? sourceRequest.semlangConfig?.projectDir,
    settings.projectDir,
  );
  if (!sourceRequest.malloyConfigPath && sourceRequest.semlangConfig) {
    return { ok: true, projectDir: sourceRequest.semlangConfig.projectDir };
  }

  const resolvedExecutionContext = await resolveMalloyExecutionContext(
    explicitProjectDir,
    sourceRequest.malloyConfigPath,
    compiledSource.sourcePaths,
    model.files,
  );
  if (resolvedExecutionContext.ok) {
    return { ok: true, executionContext: resolvedExecutionContext, projectDir: resolvedExecutionContext.projectDir };
  }
  if (sourceRequest.malloyConfigPath) {
    return {
      ok: false,
      response: {
        ok: false,
        diagnostics: jsonSafe(compiledSource.result.diagnostics),
        error: resolvedExecutionContext.error,
        context: null,
      },
    };
  }
  return {
    ok: true,
    projectDir:
      explicitProjectDir ?? inferProjectDir(compiledSource.sourcePaths, model.files, sourceRequest.malloyConfigPath),
  };
}

async function appendMalloyValidationDiagnostics(
  compiledSource: LoadedMcpSource,
  executionContext: Extract<ResolvedMalloyExecutionContext, { ok: true }> | undefined,
): Promise<void> {
  if (!compiledSource.result.malloy || !executionContext) return;
  const malloyDiagnostics = await validateMalloyModel({
    malloy: compiledSource.result.malloy,
    context: {
      projectDir: executionContext.projectDir,
      malloyConfigPath: executionContext.malloyConfigPath,
      malloyConfigSource: executionContext.source,
      modelFilePath: compiledSource.filePath,
    },
    sourceMap: compiledSource.result.malloySourceMap,
  });
  compiledSource.result.diagnostics.push(...malloyDiagnostics);
}

async function cacheLoadedSourceContext(
  context: SemLangMcpContext,
  compiledSource: LoadedMcpSource,
  sourceRequest: LoadedSourceRequest,
  loadedContext: Extract<LoadedSourceContext, { ok: true }>,
): Promise<void> {
  context.compileResult = compiledSource.result;
  context.model = compiledSource.result.model;
  context.malloy = compiledSource.result.malloy;
  context.malloySourceMap = compiledSource.result.malloySourceMap;
  context.sourceText = compiledSource.sourceText;
  context.filePath = compiledSource.filePath;
  context.sourcePaths = compiledSource.sourcePaths;
  context.sourceKind = compiledSource.sourceKind;
  context.projectDir = loadedContext.projectDir;
  context.malloyConfigPath = loadedContext.executionContext?.malloyConfigPath;
  context.malloyConfigSource = loadedContext.executionContext?.source;
  context.semlangConfig = sourceRequest.semlangConfig;
  context.exportDirectory = sourceRequest.semlangConfig?.exportDirectory ?? context.settings.exportDirectory;
  const statsResult = await refreshFieldStats(context);
  context.fieldStats = statsResult.stats;
  context.statsStatus = statsResult.status;
}

export function createSemLangMcp(settings: Partial<SemLangMcpSettings> = {}): SemLangMcpApi {
  const context: SemLangMcpContext = { settings: resolveSemLangMcpSettings(settings) };

  function requireModel(): SemanticModel {
    if (!context.model) throw new Error("No ontology source has been set. Call load_ontology first.");
    return context.model;
  }

  async function compileSource(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    context.fieldStats = undefined;
    context.statsStatus = undefined;
    const sourceRequest = await sourceRequestFromArgs(args, context.settings);
    if (!sourceRequest.ok) return sourceRequest.response;
    const compiledSource = await compileMcpSource(sourceRequest.compileArgs);
    if (!compiledSource.ok) return { ok: false, error: compiledSource.error };

    const loadedContext = await resolveLoadedSourceContext(compiledSource, sourceRequest, context.settings);
    if (!loadedContext.ok) return loadedContext.response;
    await appendMalloyValidationDiagnostics(compiledSource, loadedContext.executionContext);

    const ok = Boolean(compiledSource.result.model) && !hasErrors(compiledSource.result.diagnostics);
    if (ok && compiledSource.result.model) {
      await cacheLoadedSourceContext(context, compiledSource, sourceRequest, loadedContext);
    }

    const response: Record<string, JsonValue> = {
      ok,
      diagnostics: jsonSafe(compiledSource.result.diagnostics),
      context: loadOntologyContextSummary(compiledSource.result.model, loadedContext.executionContext, context),
    };
    if (booleanValue(args.return_malloy_model ?? args.returnMalloyModel)) {
      response.malloyModel = compiledSource.result.malloy ?? null;
    }
    return response;
  }

  async function resolveEntity(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const conceptName = stringValue(args.concept);
    const businessName = stringValue(args.business_name ?? args.businessName);
    if (conceptName || businessName)
      return jsonSafe(
        await resolveBusinessEntity(model, context.filePath, conceptName, businessName, context.fieldStats),
      ) as Record<string, JsonValue>;
    const name = stringValue(args.entity ?? args.name ?? args.term) ?? "";
    return resolved({
      ok: true,
      entity: name,
      matches: jsonSafe(resolveEntities(model, name)),
      predicates: jsonSafe(searchPredicateMatches(context.fieldStats, name, maxSearchResults)),
    });
  }

  async function search(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const kind = stringValue(args.kind)?.toLowerCase();
    const text = searchTextFromArgs(args);
    if (kind === "entity") {
      const entityArgs = entityArgsFromSearchText(requireModel(), text);
      return resolveEntity({ ...args, ...entityArgs, name: text });
    }
    const limit = numberValue(args.limit) ?? maxSearchResults;
    const matches = searchModel(requireModel(), text, limit, context.fieldStats);
    const response = { ok: true, query: text, ...matches };
    if (!kind || kind === "any") return resolved(response);
    if (kind === "concept") return resolved({ ok: true, query: text, concepts: jsonSafe(matches.concepts) });
    if (kind === "member") return resolved({ ok: true, query: text, members: jsonSafe(matches.members) });
    if (kind === "metric" || kind === "measure")
      return resolved({ ok: true, query: text, metrics: jsonSafe(matches.metrics) });
    if (kind === "lens") return resolved({ ok: true, query: text, lenses: jsonSafe(matches.lenses) });
    if (kind === "query") return resolved({ ok: true, query: text, queries: jsonSafe(matches.queries) });
    return resolved(response);
  }

  function searchTextFromArgs(args: Record<string, unknown>): string {
    return stringValue(args.query ?? args.question ?? args.phrase ?? args.text ?? args.name ?? args.entity) ?? "";
  }

  function describeConcept(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const baseModel = requireModel();
    const lenses = stringList(args.lenses ?? args.lens);
    const modelResult = modelWithLenses(baseModel, lenses, stringValue(args.concept ?? args.name));
    if (!modelResult.ok) return resolved(modelResult);
    const concept = conceptByName(modelResult.model, stringValue(args.concept ?? args.name));
    if (!concept) return resolved(notFound("concept", args.concept ?? args.name, modelResult.model));
    const includeStats = optionalBoolean(args.include_stats ?? args.includeStats) ?? true;
    return resolved({
      ok: true,
      lenses,
      concept: jsonSafe(
        describeConceptPlain(modelResult.model, concept, {
          includeStats,
          stats: lenses.length === 0 ? context.fieldStats : undefined,
        }),
      ),
    });
  }

  function describeAction(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const actionName = stringValue(args.action ?? args.name);
    const resolvedAction = resolveAction(model, stringValue(args.concept), actionName);
    if (!resolvedAction.ok) return resolved(resolvedAction);
    return resolved({ ok: true, action: jsonSafe(describeActionPlain(resolvedAction.concept, resolvedAction.action)) });
  }

  function describeRole(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const roleName = stringValue(args.role ?? args.name);
    const conceptName = stringValue(args.concept);
    const roles = roleDescriptions(model).filter(
      (role) =>
        (!roleName || role.name === roleName || role.qualifiedName === roleName) &&
        (!conceptName || role.concept === conceptName),
    );
    return resolved({
      ok: roles.length > 0,
      roles: jsonSafe(roles),
      error: roles.length === 0 ? "No matching role found." : null,
    });
  }

  function describeRoles(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const baseModel = requireModel();
    const lenses = stringList(args.lenses ?? args.lens);
    const modelResult = modelWithLenses(baseModel, lenses, stringValue(args.concept));
    if (!modelResult.ok) return resolved(modelResult);
    const conceptName = stringValue(args.concept);
    const roles = roleDescriptions(modelResult.model).filter((role) => !conceptName || role.concept === conceptName);
    return resolved({ ok: true, lenses, roles: jsonSafe(roles) });
  }

  function explainMetric(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const metricName = stringValue(args.metric ?? args.measure ?? args.name);
    const conceptName = stringValue(args.concept);
    const metrics = [...model.concepts.values()].flatMap((concept) =>
      concept.measures
        .filter(
          (measure) => (!metricName || measure.name === metricName) && (!conceptName || concept.name === conceptName),
        )
        .map((measure) => ({
          concept: concept.name,
          name: measure.name,
          description: measure.description ?? null,
          expression: measure.expression,
          typeName: measure.typeName ?? null,
          dependencies: expressionIdentifiers(measure.expression),
          location: measure.location,
        })),
    );
    return resolved({
      ok: metrics.length > 0,
      metrics: jsonSafe(metrics),
      error: metrics.length === 0 ? "No matching metric found." : null,
    });
  }

  function describeTemporalAxes(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const conceptName = stringValue(args.concept ?? args.name);
    const axes = [...model.concepts.values()]
      .filter((concept) => !conceptName || concept.name === conceptName)
      .flatMap((concept) => concept.temporal.map((axis) => ({ concept: concept.name, ...axis })));
    return resolved({ ok: true, axes: jsonSafe(axes) });
  }

  function findPaths(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const from = stringValue(args.from ?? args.source ?? args.root);
    const targets = stringList(args.to ?? args.target);
    const maxDepth = Math.max(1, Math.min(8, numberValue(args.maxDepth ?? args.depth) ?? 4));
    if (!from || targets.length === 0)
      return resolved({ ok: false, error: "Provide from/source/root and to/target concept or role names." });
    const results = targets.map((target) => ({ target, paths: findConceptPaths(model, from, target, maxDepth) }));
    return resolved({
      ok: true,
      from,
      maxDepth,
      results: jsonSafe(results),
      paths: jsonSafe(
        results.flatMap((result) =>
          result.paths.map((pathResult) => ({ target: result.target, ...(pathResult as object) })),
        ),
      ),
    });
  }

  function describeLens(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const lensName = stringValue(args.lens ?? args.name);
    const lens = lensName ? model.lenses.get(lensName) : undefined;
    if (!lens) return resolved(notFound("lens", lensName, model));
    return resolved({ ok: true, lens: jsonSafe(describeLensPlain(lens)) });
  }

  function expandLens(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const lenses = stringList(args.lenses ?? args.lens ?? args.name);
    if (lenses.length === 0) return resolved({ ok: false, error: "Provide lens or lenses." });
    const expanded = modelWithLenses(model, lenses, stringValue(args.root ?? args.concept));
    if (!expanded.ok) return resolved(expanded);
    return resolved({
      ok: true,
      lenses,
      diagnostics: jsonSafe(expanded.diagnostics),
      model: jsonSafe(modelSummary(expanded.model)),
      refinements: jsonSafe(lenses.flatMap((lensName) => describeLensRefinements(model.lenses.get(lensName)))),
    });
  }

  function requiredFields(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const lenses = stringList(args.lenses ?? args.lens ?? args.name);
    const requestedFields = stringList(args.fields ?? args.field);
    const selected =
      lenses.length > 0
        ? (lenses.map((lens) => model.lenses.get(lens)).filter(Boolean) as LensDecl[])
        : [...model.lenses.values()];
    const summaries = selected.flatMap((lens) => lensRequiredFields(lens, requestedFields));
    return resolved({
      ok: true,
      requestedFields,
      matches: jsonSafe(requestedFields.length > 0 ? summaries.filter((item) => item.matches.length > 0) : summaries),
      note:
        requestedFields.length > 0
          ? "Matched ontology fields exposed by lens refinements and fields required by lens expressions."
          : "No fields filter was provided; returning required expression fields and exposed members for each lens refinement.",
    });
  }

  function lensPlan(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const text = stringValue(args.question ?? args.goal ?? args.phrase ?? args.text) ?? "";
    const requested = stringList(args.lenses ?? args.lens);
    const lenses =
      requested.length > 0
        ? (requested.map((name) => model.lenses.get(name)).filter(Boolean) as LensDecl[])
        : (scoreLenses(model, text, 5)
            .map((item) => model.lenses.get(item.name))
            .filter(Boolean) as LensDecl[]);
    return resolved({
      ok: true,
      question: text,
      lenses: jsonSafe(lenses.map(describeLensPlain)),
      steps: jsonSafe(
        lenses.map((lens) => ({
          lens: lens.name,
          applyAfter: lens.parents,
          affectsConcepts: lens.refinements.map((refinement) => refinement.conceptName),
          addedTypes: lens.types.map((type) => type.name),
        })),
      ),
    });
  }

  type DescribeHandler = (args: Record<string, unknown>, names: string[]) => Promise<Record<string, JsonValue>>;
  const describeHandlers: Record<string, DescribeHandler> = {
    concept: (args, names) => describeConcept({ ...args, concept: names[0] }),
    action: (args, names) => describeAction({ ...args, ...actionArgsFromName(names[0]) }),
    role: (args, names) => describeRole({ ...args, role: names[0] }),
    roles: (args, names) => describeRoles({ ...args, concept: names[0] }),
    metric: (args, names) => explainMetric({ ...args, metric: names[0] }),
    measure: (args, names) => explainMetric({ ...args, metric: names[0] }),
    temporal_axes: (args, names) => describeTemporalAxes({ ...args, concept: names[0] }),
  };
  const lensDescribeHandlers: Record<string, DescribeHandler> = {
    detail: (args, names) => describeLens({ ...args, lens: names[0] }),
    expand: (args, names) => {
      const selected = describeLensSelection(requireModel(), names);
      return expandLens({ ...args, lenses: selected.lenses, concept: selected.concept });
    },
    required_fields: (args, names) =>
      requiredFields({ ...args, lenses: describeLensSelection(requireModel(), names).lenses }),
    plan: (args, names) => lensPlan({ ...args, lenses: describeLensSelection(requireModel(), names).lenses }),
  };

  async function describe(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const kind = stringValue(args.kind)?.toLowerCase() ?? "concept";
    const operation = stringValue(args.operation)?.toLowerCase();
    const names = stringList(args.names);
    if (names.length > 1 && canDescribeEachName(kind, operation)) return describeEach(args, kind, names);
    const handler = describeOperationHandler(kind, operation);
    return handler ? handler(args, names) : resolved({ ok: false, error: `Unknown describe kind ${kind}.` });
  }

  async function describeEach(
    args: Record<string, unknown>,
    kind: string,
    names: string[],
  ): Promise<Record<string, JsonValue>> {
    const results = await Promise.all(names.map((name) => describe({ ...args, names: [name] })));
    return resolved({ ok: true, kind, results: jsonSafe(results) });
  }

  function describeOperationHandler(kind: string, operation: string | undefined): DescribeHandler | undefined {
    return kind === "lens" ? lensDescribeHandlers[operation ?? "detail"] : describeHandlers[kind];
  }

  async function runQuery(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const transactionId = crypto.randomUUID();
    logTransaction("info", transactionId, "run_query requested", { tool: "run_query" }, context.settings);
    return new QueryExecution(context, requireModel(), args, transactionId).execute();
  }

  async function invokeActionTool(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const target = isRecord(args.target) ? args.target : undefined;
    if (!target) return invokeAction(args);
    const where = stringValue(target.where);
    return invokeAction({
      ...args,
      ...(target.id !== undefined ? { id: target.id } : {}),
      ...(where ? { where } : { subject: target }),
    });
  }

  async function invokeAction(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const actionName = stringValue(args.action ?? args.name);
    const resolvedAction = resolveAction(model, stringValue(args.concept), actionName);
    if (!resolvedAction.ok) return jsonSafe(resolvedAction) as Record<string, JsonValue>;
    const executionContext = actionExecutionContext(context);
    if (!executionContext.ok) return executionContext;
    const built = buildActionSql(model, resolvedAction.concept, resolvedAction.action, args);
    if (!built.ok) return actionBuildFailureResponse(resolvedAction, built);
    if (booleanValue(args.dry_run_only ?? args.dryRunOnly)) return actionDryRunResponse(resolvedAction, built);
    const queryLimitSeconds = actionQueryLimitSecondsValue(args);
    if (!queryLimitSeconds.ok) return queryLimitSeconds;
    const selectedRows = await selectRowsForAction(
      executionContext.context,
      built,
      resolvedAction,
      queryLimitSeconds.value,
    );
    if (!selectedRows.ok) return selectedRows.response;
    const execution = await executeMalloySql({
      context: executionContext.context,
      connectionName: built.connectionName,
      sql: built.sql,
      queryLimitSeconds: queryLimitSeconds.value,
    });
    if (execution.ok !== true)
      return actionExecutionFailureResponse(resolvedAction, built, execution, queryLimitSeconds.value);
    const rows = await actionResultRows(
      executionContext.context,
      built,
      execution,
      selectedRows.rows,
      queryLimitSeconds.value,
    );
    return actionSuccessResponse(
      resolvedAction,
      built,
      execution,
      rows,
      selectedRows.rows.length,
      queryLimitSeconds.value,
    );
  }

  function actionBuildFailureResponse(
    resolvedAction: Extract<ActionResolution, { ok: true }>,
    built: Extract<ActionSqlBuildResult, { ok: false }>,
  ): Record<string, JsonValue> {
    return {
      ok: false,
      engine: "malloy",
      action: resolvedAction.action.name,
      concept: resolvedAction.concept.name,
      diagnostics: jsonSafe(built.diagnostics),
    };
  }

  function actionDryRunResponse(
    resolvedAction: Extract<ActionResolution, { ok: true }>,
    built: BuiltActionSql,
  ): Record<string, JsonValue> {
    return {
      ok: true,
      skipped: true,
      reason: "dry_run_only requested; statement was generated but not executed.",
      engine: "malloy",
      action: resolvedAction.action.name,
      concept: resolvedAction.concept.name,
      operation: built.operation,
      sql: built.sql,
      diagnostics: jsonSafe(built.diagnostics),
      verificationQuery: built.verificationQuery ?? null,
      rowsQuery: built.rowsQuery ?? null,
    };
  }

  function actionExecutionFailureResponse(
    resolvedAction: Extract<ActionResolution, { ok: true }>,
    built: BuiltActionSql,
    execution: Record<string, unknown>,
    queryLimitSeconds: number,
  ): Record<string, JsonValue> {
    return {
      ok: false,
      engine: "malloy",
      action: resolvedAction.action.name,
      concept: resolvedAction.concept.name,
      operation: built.operation,
      sql: built.sql,
      diagnostics: jsonSafe(built.diagnostics),
      query_limit_seconds: (execution.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds,
      timed_out: (execution.timed_out as JsonValue | undefined) ?? false,
      error: jsonSafe(execution.error),
    };
  }

  async function actionResultRows(
    executionContext: ActionExecutionContext,
    built: BuiltActionSql,
    execution: Record<string, unknown>,
    selectedRows: Array<Record<string, unknown>>,
    queryLimitSeconds: number,
  ): Promise<Array<Record<string, unknown>>> {
    const executionRows = rowsArray(execution.rows);
    const rows = selectedRows.length > 0 ? selectedRows : executionRows;
    if (built.operation === "delete" || !built.verificationQuery) return rows;
    const selected = await executeMalloySql({
      context: executionContext,
      connectionName: built.connectionName,
      sql: built.verificationQuery,
      queryLimitSeconds,
    });
    return selected.ok === true ? rowsArray(selected.rows) : rows;
  }

  function actionSuccessResponse(
    resolvedAction: Extract<ActionResolution, { ok: true }>,
    built: BuiltActionSql,
    execution: Record<string, unknown>,
    rows: Array<Record<string, unknown>>,
    matchedRowCount: number,
    queryLimitSeconds: number,
  ): Record<string, JsonValue> {
    const changedRowCount = matchedRowCount || rows.length;
    return {
      ok: changedRowCount > 0,
      engine: "malloy",
      action: resolvedAction.action.name,
      concept: resolvedAction.concept.name,
      operation: built.operation,
      sql: built.sql,
      changedRowCount,
      query_limit_seconds: (execution.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds,
      timed_out: (execution.timed_out as JsonValue | undefined) ?? false,
      rows: jsonSafe(rows),
      diagnostics: jsonSafe(actionResultDiagnostics(built.diagnostics, changedRowCount)),
      verificationQuery: built.verificationQuery ?? null,
    };
  }

  function actionResultDiagnostics(diagnostics: string[], changedRowCount: number): string[] {
    return changedRowCount > 0
      ? diagnostics
      : [...diagnostics, "Action matched no rows; the subject may not exist or a guard may have failed."];
  }

  const commands = {
    load_ontology: { execute: compileSource },
    search: { execute: search },
    describe: { execute: describe },
    find_paths: { execute: findPaths },
    run_query: { execute: runQuery },
    invoke_action: { execute: invokeActionTool },
  } satisfies SemLangCommandRegistry;

  const tools = toolsFromCommands(commands);

  return {
    tools,
    toolDescriptions: mcpToolDescriptions,
    toolInputSchemas: mcpToolInputSchemas,
    getContext() {
      return { ...context };
    },
  };
}

export function createSemLangMcpServer(api: SemLangMcpApi = createSemLangMcp()): McpServer {
  const server = new McpServer({ name: "semlang-mcp", version: getSemLangVersion() });
  for (const [name, handler] of Object.entries(api.tools)) {
    const registeredTool = server.registerTool(
      name,
      {
        description: api.toolDescriptions[name],
        inputSchema: api.toolInputSchemas[name],
      },
      async (args) => {
        const structuredContent = await handler(args as Record<string, unknown>);
        return {
          content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
          structuredContent,
        };
      },
    );
    registeredTool.execution = undefined;
  }
  return server;
}

export async function runSemLangMcpStdioServer(): Promise<void> {
  const server = createSemLangMcpServer();
  await server.connect(new StdioServerTransport());
}

export async function runSemLangMcpStdioServerWithSettings(settings: Partial<SemLangMcpSettings> = {}): Promise<void> {
  const server = createSemLangMcpServer(createSemLangMcp(settings));
  await server.connect(new StdioServerTransport());
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

async function refreshFieldStats(
  context: SemLangMcpContext,
): Promise<{ stats: FieldStatsIndex; status: StatsRefreshStatus }> {
  const stats: FieldStatsIndex = new Map();
  const model = context.model;
  const members = model ? indexedMemberRefs(model) : [];
  const cacheDirectory = fieldStatsCacheDirectory(context);
  const status: StatsRefreshStatus = {
    enabled: context.settings.updateStats,
    cacheDirectory,
    updated: 0,
    cached: 0,
    failed: 0,
    skipped: 0,
    warnings: [],
  };
  if (!model || !context.settings.updateStats) {
    status.skipped = members.length;
    return { stats, status };
  }

  let preparedCacheDirectory: string;
  let baseFingerprint: Record<string, unknown>;
  try {
    preparedCacheDirectory = await prepareFieldStatsCacheDirectory({
      projectDir: context.projectDir ?? context.settings.projectDir,
      statsCacheDirectory: context.settings.statsCacheDirectory,
    });
    baseFingerprint = await fieldStatsBaseFingerprint(context);
  } catch (error) {
    status.failed = members.length;
    status.warnings.push(`Field statistics setup failed: ${error instanceof Error ? error.message : String(error)}`);
    return { stats, status };
  }

  await forEachWithConcurrency(members, context.settings.maxParallelQueries, async (member) => {
    const concept = model.concepts.get(member.concept);
    if (!concept) return;
    const cacheKey = fieldStatsCacheKey(baseFingerprint, context, concept, member);
    const cachePath = path.join(preparedCacheDirectory, `${cacheKey}.json`);
    try {
      const cached = await readFieldStatsCache(cachePath, cacheKey);
      if (cached) {
        stats.set(fieldStatsKey(member.concept, member.memberKind, member.member), cached);
        status.cached += 1;
        return;
      }
      const collected = await collectFieldStats(context, concept, member, cacheKey);
      await fs.writeFile(cachePath, `${JSON.stringify(collected, null, 2)}\n`);
      stats.set(fieldStatsKey(member.concept, member.memberKind, member.member), collected);
      status.updated += 1;
    } catch (error) {
      status.failed += 1;
      status.warnings.push(
        `${member.concept}.${member.member}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  return { stats, status };
}

function fieldStatsCacheDirectory(context: SemLangMcpContext): string {
  return resolveFieldStatsCacheDirectory({
    projectDir: context.projectDir ?? context.settings.projectDir,
    statsCacheDirectory: context.settings.statsCacheDirectory,
  });
}

async function forEachWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const current = index;
        index += 1;
        if (current >= items.length) return;
        await handler(items[current]!);
      }
    }),
  );
}

async function fieldStatsBaseFingerprint(context: SemLangMcpContext): Promise<Record<string, unknown>> {
  return {
    sourceKind: context.sourceKind ?? null,
    sourceTextHash: context.sourceText ? hashText(context.sourceText) : null,
    files: await Promise.all(
      [...new Set([...(context.sourcePaths ?? []), ...(context.model?.files ?? [])])]
        .filter((file) => !file.includes("__semlang_mcp_inline__") && !file.includes("__semlang_mcp_context__"))
        .sort()
        .map(fileFingerprint),
    ),
    malloyConfig: context.malloyConfigPath ? await fileFingerprint(context.malloyConfigPath) : null,
  };
}

async function fileFingerprint(filePath: string): Promise<Record<string, unknown>> {
  try {
    const [contents, stat] = await Promise.all([fs.readFile(filePath, "utf8"), fs.stat(filePath)]);
    return { path: filePath, mtimeMs: stat.mtimeMs, size: stat.size, sha256: hashText(contents) };
  } catch {
    return { path: filePath, missing: true };
  }
}

function fieldStatsCacheKey(
  baseFingerprint: Record<string, unknown>,
  context: SemLangMcpContext,
  concept: ResolvedConcept,
  member: IndexedMemberRef,
): string {
  return hashText(
    JSON.stringify({
      baseFingerprint,
      packageName: context.model?.packageName ?? null,
      concept: concept.name,
      source: concept.source.expression,
      member,
      completeValueMaxDistinctCount: context.settings.completeValueMaxDistinctCount,
      sampleValueMaxCount: context.settings.sampleValueMaxCount,
    }),
  );
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function readFieldStatsCache(cachePath: string, cacheKey: string): Promise<FieldStatsEntry | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(cachePath, "utf8")) as FieldStatsEntry;
    return parsed.cacheKey === cacheKey ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function indexedMemberRefs(model: SemanticModel): IndexedMemberRef[] {
  return [...model.concepts.values()].flatMap((concept) => [
    ...concept.fields
      .filter((field) => field.indexed)
      .map((field) => ({
        concept: concept.name,
        member: field.name,
        memberKind: "field" as const,
        expression: field.name,
        typeName: field.typeName,
      })),
    ...concept.dimensions
      .filter((dimension) => dimension.indexed)
      .map((dimension) => ({
        concept: concept.name,
        member: dimension.name,
        memberKind: "dimension" as const,
        expression: dimension.expression,
        typeName: dimension.typeName,
      })),
    ...concept.measures
      .filter((measure) => measure.indexed)
      .map((measure) => ({
        concept: concept.name,
        member: measure.name,
        memberKind: "measure" as const,
        expression: measure.expression,
        typeName: measure.typeName,
      })),
  ]);
}

async function collectFieldStats(
  context: SemLangMcpContext,
  concept: ResolvedConcept,
  member: IndexedMemberRef,
  cacheKey: string,
): Promise<FieldStatsEntry> {
  const plan = fieldStatsCollectionPlan(context, concept, member);
  return member.memberKind === "measure"
    ? collectMeasureStats(context, plan, member, cacheKey)
    : collectMemberStats(context, plan, member, cacheKey);
}

interface FieldStatsCollectionPlan {
  concept: ResolvedConcept;
  physicalSource: Extract<SourceExpression, { kind: "table" | "sql" }>;
  ctx: SqlBuildContext;
  valueSql: string;
  whereSql: string;
  executionContext: {
    projectDir: string;
    malloyConfigPath: string;
    malloyConfigSource?: "explicit" | "discovered";
    modelFilePath?: string;
  };
}

function fieldStatsCollectionPlan(
  context: SemLangMcpContext,
  concept: ResolvedConcept,
  member: IndexedMemberRef,
): FieldStatsCollectionPlan {
  const physicalSource = resolvedPhysicalSource(context.model!, concept.source);
  if (!physicalSource) throw new Error(`${concept.name} is not backed by a table or SQL source.`);
  if (!context.projectDir || !context.malloyConfigPath) throw new Error("No Malloy execution context is available.");
  const ctx = fieldStatsSqlBuildContext(context, concept);
  const diagnostics: string[] = [];
  const valueSql = fieldStatsValueSql(ctx, concept, member, diagnostics);
  const whereSql = conceptWhereSql(ctx, concept, diagnostics);
  if (diagnostics.length > 0) throw new Error(diagnostics.join(" "));
  return {
    concept,
    physicalSource,
    ctx,
    valueSql,
    whereSql,
    executionContext: {
      projectDir: context.projectDir,
      malloyConfigPath: context.malloyConfigPath,
      malloyConfigSource: context.malloyConfigSource,
      modelFilePath: executionModelFilePath(context),
    },
  };
}

function fieldStatsSqlBuildContext(context: SemLangMcpContext, concept: ResolvedConcept): SqlBuildContext {
  return {
    model: context.model!,
    root: concept,
    joins: new Map([["", "root"]]),
    joinClauses: [],
  };
}

function fieldStatsValueSql(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  member: IndexedMemberRef,
  diagnostics: string[],
): string {
  if (member.memberKind === "field") return `root.${quoteIdent(member.member)}`;
  return member.memberKind === "measure"
    ? sqlMeasureExpression(ctx, concept, "", member.expression, diagnostics)
    : sqlExpression(ctx, concept, "", member.expression, diagnostics);
}

async function collectMeasureStats(
  context: SemLangMcpContext,
  plan: FieldStatsCollectionPlan,
  member: IndexedMemberRef,
  cacheKey: string,
): Promise<FieldStatsEntry> {
  const sql = [
    `SELECT ${plan.valueSql} AS value, COUNT(*) AS row_count`,
    statsFromSql(plan.physicalSource, plan.ctx),
    plan.whereSql ? `WHERE ${plan.whereSql}` : "",
    ";",
  ]
    .filter(Boolean)
    .join("\n");
  const execution = await executeMalloySql({
    context: plan.executionContext,
    connectionName: plan.physicalSource.connection,
    sql,
    queryLimitSeconds: context.settings.statsQueryLimitSeconds,
    rowLimit: 1,
  });
  if (execution.ok !== true) throw new Error(String(execution.error ?? "Measure statistics query failed."));
  const row = rowsArray(execution.rows)[0] ?? {};
  return {
    ...baseFieldStatsEntry(plan.concept, member, cacheKey),
    rowCount: numberField(row, "row_count"),
    measureValue: jsonNumberOrField(row, "value"),
    executionTimeMs: numberValue(execution.execution_time_ms),
  };
}

async function collectMemberStats(
  context: SemLangMcpContext,
  plan: FieldStatsCollectionPlan,
  member: IndexedMemberRef,
  cacheKey: string,
): Promise<FieldStatsEntry> {
  const valueCte = statsValueCte(plan.physicalSource, plan.ctx, plan.valueSql, plan.whereSql);
  const summarySql = [
    valueCte,
    "SELECT",
    "  COUNT(*) AS row_count,",
    "  COUNT(value) AS non_null_count,",
    "  COUNT(*) - COUNT(value) AS null_count,",
    "  COUNT(DISTINCT value) AS distinct_count,",
    "  MIN(value) AS min_value,",
    "  MAX(value) AS max_value",
    "FROM __semlang_stats_values;",
  ].join("\n");
  const summaryExecution = await executeMalloySql({
    context: plan.executionContext,
    connectionName: plan.physicalSource.connection,
    sql: summarySql,
    queryLimitSeconds: context.settings.statsQueryLimitSeconds,
    rowLimit: 1,
  });
  if (summaryExecution.ok !== true)
    throw new Error(String(summaryExecution.error ?? "Field statistics summary query failed."));
  const summary = rowsArray(summaryExecution.rows)[0] ?? {};
  const distinctCount = numberField(summary, "distinct_count") ?? 0;
  const complete = distinctCount <= context.settings.completeValueMaxDistinctCount;
  const valueLimit = complete ? context.settings.completeValueMaxDistinctCount : context.settings.sampleValueMaxCount;
  const valuesSql = [
    valueCte,
    "SELECT value, COUNT(*) AS value_count",
    "FROM __semlang_stats_values",
    "WHERE value IS NOT NULL",
    "GROUP BY value",
    "ORDER BY value_count DESC, CAST(value AS VARCHAR) ASC",
    `LIMIT ${valueLimit};`,
  ].join("\n");
  const valuesExecution = await executeMalloySql({
    context: plan.executionContext,
    connectionName: plan.physicalSource.connection,
    sql: valuesSql,
    queryLimitSeconds: context.settings.statsQueryLimitSeconds,
    rowLimit: valueLimit,
  });
  if (valuesExecution.ok !== true) throw new Error(String(valuesExecution.error ?? "Field values query failed."));
  return {
    ...baseFieldStatsEntry(plan.concept, member, cacheKey),
    rowCount: numberField(summary, "row_count"),
    nonNullCount: numberField(summary, "non_null_count"),
    nullCount: numberField(summary, "null_count"),
    distinctCount,
    min: jsonField(summary, "min_value"),
    max: jsonField(summary, "max_value"),
    values: {
      kind: complete ? "complete" : "sample",
      values: rowsArray(valuesExecution.rows).map((row) => ({
        value: jsonField(row, "value"),
        count: numberField(row, "value_count"),
      })),
      completeValueMaxDistinctCount: context.settings.completeValueMaxDistinctCount,
      sampleValueMaxCount: context.settings.sampleValueMaxCount,
    },
    executionTimeMs: numberValue(summaryExecution.execution_time_ms),
  };
}

function baseFieldStatsEntry(concept: ResolvedConcept, member: IndexedMemberRef, cacheKey: string): FieldStatsEntry {
  return {
    concept: concept.name,
    member: member.member,
    memberKind: member.memberKind,
    expression: member.expression,
    typeName: member.typeName ?? null,
    updatedAt: new Date().toISOString(),
    cacheKey,
  };
}

function resolvedPhysicalSource(
  model: SemanticModel,
  source: SourceExpression,
  seen: Set<string> = new Set(),
): Extract<SourceExpression, { kind: "table" | "sql" }> | undefined {
  if (source.kind === "table" || source.kind === "sql") return source;
  if (seen.has(source.name)) return undefined;
  seen.add(source.name);
  const namedSource = model.sources.get(source.name);
  if (namedSource) return resolvedPhysicalSource(model, namedSource.source, seen);
  const concept = model.concepts.get(source.name);
  return concept ? resolvedPhysicalSource(model, concept.source, seen) : undefined;
}

function conceptWhereSql(ctx: SqlBuildContext, concept: ResolvedConcept, diagnostics: string[]): string {
  return concept.where
    .map((where) => sqlExpression(ctx, concept, "", where.expression, diagnostics))
    .filter(Boolean)
    .map((where) => `(${where})`)
    .join(" AND ");
}

function statsValueCte(
  source: Extract<SourceExpression, { kind: "table" | "sql" }>,
  ctx: SqlBuildContext,
  valueSql: string,
  whereSql: string,
): string {
  return [
    "WITH __semlang_stats_values AS (",
    `  SELECT ${valueSql} AS value`,
    `  ${statsFromSql(source, ctx)}`,
    whereSql ? `  WHERE ${whereSql}` : "",
    ")",
  ]
    .filter(Boolean)
    .join("\n");
}

function statsFromSql(source: Extract<SourceExpression, { kind: "table" | "sql" }>, ctx: SqlBuildContext): string {
  const from = source.kind === "table" ? quoteTablePath(source.path) : `(${source.sql})`;
  return [`FROM ${from} AS root`, ...ctx.joinClauses].join("\n");
}

function rowsArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function numberField(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

function jsonField(row: Record<string, unknown>, key: string): JsonValue {
  return jsonSafe(row[key]);
}

function jsonNumberOrField(row: Record<string, unknown>, key: string): JsonValue {
  return numberField(row, key) ?? jsonField(row, key);
}

function fieldStatsKey(concept: string, memberKind: IndexedMemberKind, member: string): string {
  return `${concept}.${memberKind}.${member}`;
}

interface SqlBuildContext {
  model: SemanticModel;
  root: ResolvedConcept;
  joins: Map<string, string>;
  joinClauses: string[];
  writeContext?: boolean;
}

function loadOntologyContextSummary(
  model: SemanticModel | undefined,
  executionContext: Extract<ResolvedMalloyExecutionContext, { ok: true }> | undefined,
  context: SemLangMcpContext,
): JsonValue {
  if (!model) return null;
  return jsonSafe({
    ...modelSummary(model),
    execution: {
      projectDir: executionContext?.projectDir ?? context.projectDir ?? null,
      malloyConfigPath: executionContext?.malloyConfigPath ?? null,
      malloyConfigSource: executionContext?.source ?? null,
    },
    statsStatus: context.statsStatus ?? null,
  });
}

function executionModelFilePath(context: SemLangMcpContext): string | undefined {
  if (context.filePath && !isSyntheticMcpPath(context.filePath)) {
    return context.filePath;
  }
  return context.sourcePaths?.[0] ?? context.model?.files[0];
}

async function exampleDuckDbScripts(
  filePath: string,
): Promise<{ schema: string; sampleData: string; schemaPath: string } | undefined> {
  const base = path.dirname(filePath);
  const schemaPath = path.join(base, "schema.sql");
  const samplePath = path.join(base, "sample_data.sql");
  try {
    const [schema, sampleData] = await Promise.all([fs.readFile(schemaPath, "utf8"), fs.readFile(samplePath, "utf8")]);
    return { schema, sampleData, schemaPath };
  } catch {
    return undefined;
  }
}

function actionExecutionContext(context: SemLangMcpContext):
  | {
      ok: true;
      context: { projectDir: string; malloyConfigPath: string; malloyConfigSource?: "explicit" | "discovered" };
    }
  | {
      ok: false;
      error: string;
    } {
  if (!context.projectDir || !context.malloyConfigPath) {
    return {
      ok: false,
      error: missingMalloyConfigMessage(),
    };
  }
  return {
    ok: true,
    context: {
      projectDir: context.projectDir,
      malloyConfigPath: context.malloyConfigPath,
      malloyConfigSource: context.malloyConfigSource,
    },
  };
}

function missingMalloyConfigMessage(): string {
  return [
    "No Malloy config is configured for this SemLang project.",
    'Run "semlang setup --force" after adding malloy-config.json, or add malloy.configPath to .semlang/settings.yml.',
  ].join(" ");
}

type ActionResolution =
  | { ok: true; concept: ResolvedConcept; action: ActionDecl }
  | { ok: false; error: string; candidates?: Array<Record<string, unknown>>; context?: unknown };
type ActionTargetAssignment = { column: string; expression: string };
type TableSourceExpression = Extract<SourceExpression, { kind: "table" }>;
type ActionSqlSubjectMode = "single" | "collection";
type ActionSqlMode = ActionSqlSubjectMode | "new";
type ActionSqlBuildResult =
  | {
      ok: true;
      sql: string;
      diagnostics: string[];
      verificationQuery?: string;
      rowsQuery?: string;
      operation: "update" | "insert" | "delete";
      connectionName: string;
    }
  | { ok: false; diagnostics: string[] };
type BuiltActionSql = Extract<ActionSqlBuildResult, { ok: true }>;
type ActionExecutionContext = Extract<ReturnType<typeof actionExecutionContext>, { ok: true }>["context"];

async function selectRowsForAction(
  executionContext: ActionExecutionContext,
  built: BuiltActionSql,
  resolvedAction: Extract<ActionResolution, { ok: true }>,
  queryLimitSeconds: number,
): Promise<{ ok: true; rows: Array<Record<string, unknown>> } | { ok: false; response: Record<string, JsonValue> }> {
  if (!built.rowsQuery) return { ok: true, rows: [] };

  const selected = await executeMalloySql({
    context: executionContext,
    connectionName: built.connectionName,
    sql: built.rowsQuery,
    queryLimitSeconds,
  });
  if (selected.ok !== true) {
    return {
      ok: false,
      response: {
        ok: false,
        engine: "malloy",
        action: resolvedAction.action.name,
        concept: resolvedAction.concept.name,
        operation: built.operation,
        sql: built.sql,
        diagnostics: jsonSafe(built.diagnostics),
        query_limit_seconds: (selected.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds,
        timed_out: (selected.timed_out as JsonValue | undefined) ?? false,
        error: selected.error,
      },
    };
  }

  const rows = Array.isArray(selected.rows) ? (selected.rows as Array<Record<string, unknown>>) : [];
  if (rows.length > 0) return { ok: true, rows };

  return {
    ok: false,
    response: {
      ok: false,
      engine: "malloy",
      action: resolvedAction.action.name,
      concept: resolvedAction.concept.name,
      operation: built.operation,
      sql: built.sql,
      changedRowCount: 0,
      query_limit_seconds: (selected.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds,
      timed_out: (selected.timed_out as JsonValue | undefined) ?? false,
      rows: [],
      diagnostics: jsonSafe([
        ...built.diagnostics,
        "Action matched no rows; the subject may not exist or a guard may have failed.",
      ]),
      verificationQuery: built.verificationQuery ?? null,
    },
  };
}

function resolveAction(
  model: SemanticModel,
  conceptName: string | undefined,
  actionName: string | undefined,
): ActionResolution {
  if (!actionName) {
    return {
      ok: false,
      error: "Provide action or name.",
      candidates: actionCandidates(model),
    };
  }
  if (conceptName) {
    const concept = model.concepts.get(conceptName);
    if (!concept) return { ok: false, error: `No concept found for ${conceptName}.`, context: modelSummary(model) };
    const action = concept.actions.find((candidate) => candidate.name === actionName);
    if (!action) {
      return {
        ok: false,
        error: `No action ${actionName} found on concept ${conceptName}.`,
        candidates: concept.actions.map((candidate) => ({ concept: concept.name, action: candidate.name })),
      };
    }
    return { ok: true, concept, action };
  }
  const matches = [...model.concepts.values()].flatMap((concept) =>
    concept.actions.filter((action) => action.name === actionName).map((action) => ({ concept, action })),
  );
  if (matches.length === 1) return { ok: true, concept: matches[0]!.concept, action: matches[0]!.action };
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Action ${actionName} is ambiguous; provide concept.`,
      candidates: matches.map((match) => ({
        concept: match.concept.name,
        action: match.action.name,
        subject: match.action.subject?.mode ?? null,
      })),
    };
  }
  return { ok: false, error: `No action found for ${actionName}.`, candidates: actionCandidates(model) };
}

function actionCandidates(model: SemanticModel): Array<Record<string, unknown>> {
  return [...model.concepts.values()].flatMap((concept) =>
    concept.actions.map((action) => ({
      concept: concept.name,
      action: action.name,
      subject: action.subject?.mode ?? null,
    })),
  );
}

function entityArgsFromSearchText(model: SemanticModel, text: string): Record<string, unknown> {
  const trimmed = text.trim();
  for (const concept of model.concepts.keys()) {
    if (trimmed === concept) return { concept };
    if (trimmed.startsWith(`${concept} `)) return { concept, business_name: trimmed.slice(concept.length).trim() };
  }
  return {};
}

function actionArgsFromName(name: string | undefined): Record<string, unknown> {
  if (!name) return {};
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(name);
  return match ? { concept: match[1], action: match[2] } : { action: name };
}

function canDescribeEachName(kind: string, operation: string | undefined): boolean {
  return (
    ["concept", "action", "role", "roles", "metric", "measure", "temporal_axes"].includes(kind) ||
    (kind === "lens" && (!operation || operation === "detail"))
  );
}

function describeLensSelection(model: SemanticModel, names: string[]): { lenses: string[]; concept?: string } {
  const concept = names.find((name) => model.concepts.has(name));
  const lenses = names.filter((name) => model.lenses.has(name));
  return { lenses, concept };
}

function buildActionSql(
  model: SemanticModel,
  concept: ResolvedConcept,
  action: ActionDecl,
  args: Record<string, unknown>,
): ActionSqlBuildResult {
  const diagnostics: string[] = [];
  if (concept.source.kind !== "table") {
    return {
      ok: false,
      diagnostics: [`Action ${action.name} cannot run because ${concept.name} is not backed by a table source.`],
    };
  }
  const mode = action.subject?.mode;
  if (!isActionSqlMode(mode)) {
    return {
      ok: false,
      diagnostics: [
        `Action invocation currently supports subject:single, subject:collection, and subject:new; ${action.name} declares ${mode ?? "no subject"}.`,
      ],
    };
  }
  const params = actionParameterValues(action, args, diagnostics);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const tableSource = concept.source;
  const ctx: SqlBuildContext = {
    model,
    root: concept,
    joins: new Map([["", "root"]]),
    joinClauses: [],
    writeContext: mode === "single" || mode === "collection",
  };

  return mode === "new"
    ? buildNewActionSql(concept, action, args, params, tableSource, ctx, diagnostics)
    : buildSubjectActionSql(concept, action, args, params, tableSource, ctx, diagnostics, mode);
}

function isActionSqlMode(mode: string | undefined): mode is ActionSqlMode {
  return mode === "single" || mode === "new" || mode === "collection";
}

function buildSubjectActionSql(
  concept: ResolvedConcept,
  action: ActionDecl,
  args: Record<string, unknown>,
  params: Map<string, unknown>,
  tableSource: TableSourceExpression,
  ctx: SqlBuildContext,
  diagnostics: string[],
  mode: ActionSqlSubjectMode,
): ActionSqlBuildResult {
  const subjectWhere = subjectWhereSql(concept, args, diagnostics, mode);
  const guardSql = action.guards.map((guard) =>
    actionExpressionSql(ctx, concept, guard.predicate, params, diagnostics),
  );
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const assignments = action.edits.flatMap((edit) =>
    edit.kind === "set" ? actionSetAssignments(ctx, concept, edit, params, diagnostics) : [],
  );
  const deleteEdits = action.edits.filter((edit) => edit.kind === "delete");
  const unsupported = action.edits
    .filter((edit) => edit.kind !== "set" && edit.kind !== "delete")
    .map((edit) => edit.kind);
  if (unsupported.length > 0)
    diagnostics.push(`Skipped unsupported edit kinds for subject:${mode}: ${unsupported.join(", ")}.`);
  if (concept.identities.length === 0)
    diagnostics.push(`Action ${action.name} cannot run because concept ${concept.name} has no identity fields.`);
  const hasDelete = deleteEdits.length > 0;
  if (hasDelete && assignments.length > 0)
    diagnostics.push(`Action ${action.name} mixes set and delete edits; choose one operation.`);
  if (!hasDelete && assignments.length === 0)
    diagnostics.push(`Action ${action.name} has no set edits that can be lowered to SQL.`);
  if (hasDelete && deleteEdits.length !== action.edits.length)
    diagnostics.push(`Action ${action.name} includes non-delete edits that cannot be lowered with delete.`);
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const where = [subjectWhere, ...guardSql.map((guard) => `(${guard})`)]
    .filter((clause) => clause.trim().length > 0)
    .join(" AND ");
  if (!where) {
    return {
      ok: false,
      diagnostics: [
        `Action ${action.name} produced an empty subject predicate; provide a non-empty where/subject filter.`,
      ],
    };
  }
  const selector = actionTargetSelectorSql(concept, tableSource.path, ctx, assignments, where, hasDelete);
  const rowsQuery = actionRowsQuerySql(tableSource.path, ctx, where);
  const sql = hasDelete
    ? deleteFromTargetSelectorSql(concept, tableSource.path, selector)
    : updateFromTargetSelectorSql(concept, tableSource.path, assignments, selector);
  return {
    ok: true,
    sql,
    operation: hasDelete ? "delete" : "update",
    connectionName: tableSource.connection,
    diagnostics,
    verificationQuery: `SELECT * FROM ${quoteTablePath(tableSource.path)} AS root WHERE ${subjectWhere};`,
    rowsQuery,
  };
}

function buildNewActionSql(
  concept: ResolvedConcept,
  action: ActionDecl,
  args: Record<string, unknown>,
  params: Map<string, unknown>,
  tableSource: TableSourceExpression,
  ctx: SqlBuildContext,
  diagnostics: string[],
): ActionSqlBuildResult {
  const insert = action.edits.find(
    (edit): edit is Extract<ActionEditDecl, { kind: "insert" }> => edit.kind === "insert",
  );
  if (!insert) return { ok: false, diagnostics: [`Action ${action.name} has no insert edit for subject:new.`] };
  const values = new Map<string, string>();
  for (const identity of concept.identities) {
    const identityValue = subjectValue(identity.name, args) ?? generatedIdentityValue(concept, action, identity.name);
    values.set(identity.name, sqlLiteral(identityValue));
  }
  for (const assignment of insert.assignments) {
    const valueSql = actionExpressionSql(ctx, concept, assignment.expression, params, diagnostics);
    for (const target of actionTargetAssignments(concept, assignment.target, valueSql, diagnostics)) {
      values.set(target.column, target.expression);
    }
  }
  if (diagnostics.length > 0) return { ok: false, diagnostics };
  const columns = [...values.keys()];
  const sql = [
    `INSERT INTO ${quoteTablePath(tableSource.path)} (${columns.map(quoteIdent).join(", ")})`,
    `VALUES (${columns.map((column) => values.get(column)).join(", ")})`,
    ";",
  ].join("\n");
  const identity = concept.identities[0];
  const verificationQuery =
    identity && values.has(identity.name)
      ? `SELECT * FROM ${quoteTablePath(tableSource.path)} WHERE ${quoteIdent(identity.name)} = ${values.get(identity.name)};`
      : undefined;
  return { ok: true, sql, diagnostics, verificationQuery, operation: "insert", connectionName: tableSource.connection };
}

interface ActionUpdateAssignment {
  column: string;
  expression: string;
}

function actionTargetSelectorSql(
  concept: ResolvedConcept,
  tablePath: string,
  ctx: SqlBuildContext,
  assignments: ActionUpdateAssignment[],
  where: string,
  deleteOnly: boolean,
): string {
  const identitySelect = concept.identities.map(
    (identity, index) => `root.${quoteIdent(identity.name)} AS ${quoteIdent(`__id_${index}`)}`,
  );
  const assignmentSelect = deleteOnly
    ? []
    : assignments.map((assignment, index) => `${assignment.expression} AS ${quoteIdent(`__set_${index}`)}`);
  return [
    `SELECT ${[...identitySelect, ...assignmentSelect].join(", ")}`,
    `FROM ${quoteTablePath(tablePath)} AS root`,
    ...ctx.joinClauses,
    `WHERE ${where}`,
  ].join("\n");
}

function actionRowsQuerySql(tablePath: string, ctx: SqlBuildContext, where: string): string {
  return [`SELECT root.*`, `FROM ${quoteTablePath(tablePath)} AS root`, ...ctx.joinClauses, `WHERE ${where};`].join(
    "\n",
  );
}

function updateFromTargetSelectorSql(
  concept: ResolvedConcept,
  tablePath: string,
  assignments: ActionUpdateAssignment[],
  selectorSql: string,
): string {
  const keys = actionIdentityJoinConditions(concept);
  const exists = actionExistsPredicate(selectorSql, keys);
  return [
    `UPDATE ${quoteTablePath(tablePath)} AS root`,
    `SET ${assignments.map((assignment, index) => `${quoteIdent(assignment.column)} = (${actionScalarAssignmentSql(selectorSql, keys, index)})`).join(", ")}`,
    `WHERE EXISTS (${exists});`,
  ].join("\n");
}

function deleteFromTargetSelectorSql(concept: ResolvedConcept, tablePath: string, selectorSql: string): string {
  const keys = actionIdentityJoinConditions(concept);
  const exists = actionExistsPredicate(selectorSql, keys);
  return [`DELETE FROM ${quoteTablePath(tablePath)} AS root`, `WHERE EXISTS (${exists});`].join("\n");
}

function actionScalarAssignmentSql(selectorSql: string, keys: string, index: number): string {
  return [`SELECT src.${quoteIdent(`__set_${index}`)}`, "FROM (", selectorSql, ") AS src", `WHERE ${keys}`].join("\n");
}

function actionExistsPredicate(selectorSql: string, keys: string): string {
  return ["SELECT 1", "FROM (", selectorSql, ") AS src", `WHERE ${keys}`].join("\n");
}

function actionIdentityJoinConditions(concept: ResolvedConcept): string {
  return concept.identities
    .map((identity, index) => `root.${quoteIdent(identity.name)} = src.${quoteIdent(`__id_${index}`)}`)
    .join(" AND ");
}

function actionParameterValues(
  action: ActionDecl,
  args: Record<string, unknown>,
  diagnostics: string[],
): Map<string, unknown> {
  const supplied = isRecord(args.params) ? args.params : {};
  const params = new Map<string, unknown>();
  for (const param of action.params) {
    const value = supplied[param.name] ?? args[param.name];
    if (value !== undefined) {
      params.set(param.name, value);
      continue;
    }
    if (param.defaultExpression !== undefined) {
      params.set(param.name, literalExpressionValue(param.defaultExpression));
      continue;
    }
    if (!param.nullable) diagnostics.push(`Missing required action parameter ${param.name}.`);
  }
  return params;
}

function actionSetAssignments(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  edit: Extract<ActionEditDecl, { kind: "set" }>,
  params: Map<string, unknown>,
  diagnostics: string[],
): ActionUpdateAssignment[] {
  const valueSql = actionExpressionSql(ctx, concept, edit.expression, params, diagnostics);
  return actionTargetAssignments(concept, edit.target, valueSql, diagnostics);
}

function actionTargetAssignments(
  concept: ResolvedConcept,
  target: string,
  valueSql: string,
  diagnostics: string[],
): ActionTargetAssignment[] {
  const member =
    concept.fields.find((candidate) => candidate.name === target) ??
    concept.dimensions.find((candidate) => candidate.name === target);
  if (!member) {
    diagnostics.push(`Action target ${target} is not a field or writeable dimension on ${concept.name}.`);
    return [];
  }
  const mappings =
    member.writeMappings.length > 0 ? member.writeMappings : [{ kind: "default" as const, location: member.location }];
  return mappings.flatMap<ActionTargetAssignment>((mapping) => {
    if (mapping.kind === "default") return [{ column: target, expression: valueSql }];
    if (mapping.kind === "column") {
      return [{ column: mapping.column, expression: replaceValueBinding(mapping.expression, valueSql) }];
    }
    const parsed = parseRawSqlAssignment(mapping.sql, target, diagnostics);
    if (!parsed) return [];
    return [{ column: parsed.column, expression: replaceValueBinding(parsed.expression, valueSql) }];
  });
}

function parseRawSqlAssignment(
  sql: string,
  target: string,
  diagnostics: string[],
): { column: string; expression: string } | undefined {
  if (!/\{\s*value\s*\}/.test(sql)) {
    diagnostics.push(`Raw SQL write mapping for ${target} must include a {value} placeholder.`);
    return undefined;
  }
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/.exec(sql);
  if (!match) {
    diagnostics.push(`Raw SQL write mapping for ${target} must be a single column assignment fragment.`);
    return undefined;
  }
  return { column: match[1]!, expression: match[2]! };
}

function actionExpressionSql(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  expression: string,
  params: Map<string, unknown>,
  diagnostics: string[],
): string {
  const trimmed = normalizeActionExpression(expression);
  if (params.has(trimmed)) return sqlLiteral(params.get(trimmed));
  if (/^current_(time|timestamp)$/i.test(trimmed)) return "CURRENT_TIMESTAMP";
  if (/^current_date$/i.test(trimmed)) return "CURRENT_DATE";
  if (/^true$/i.test(trimmed)) return "TRUE";
  if (/^false$/i.test(trimmed)) return "FALSE";
  if (/^null$/i.test(trimmed)) return "NULL";
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  if (/^'.*'$/.test(trimmed)) return trimmed;
  return sqlExpression(ctx, concept, "", replaceParameterReferences(trimmed, params), diagnostics);
}

function normalizeActionExpression(expression: string): string {
  return expression
    .replace(/\bthis\./g, "")
    .replace(/\bin\s*\[/gi, "in (")
    .replace(/\]/g, ")")
    .trim();
}

function replaceParameterReferences(expression: string, params: Map<string, unknown>): string {
  const replacements = new Map([...params.entries()].map(([key, value]) => [key, sqlLiteral(value)]));
  return replaceOutsideStrings(expression, replacements);
}

function replaceValueBinding(expression: string, valueSql: string): string {
  const placeholder = "__semlang_value__";
  return replaceOutsideStrings(
    expression.replace(/\{\s*value\s*\}/g, placeholder),
    new Map([
      ["value", valueSql],
      [placeholder, valueSql],
    ]),
  );
}

function subjectWhereSql(
  concept: ResolvedConcept,
  args: Record<string, unknown>,
  diagnostics: string[],
  mode: "single" | "collection",
): string {
  const rawWhere = stringValue(args.where);
  if (rawWhere !== undefined) {
    const normalizedWhere = normalizeActionExpression(rawWhere);
    if (normalizedWhere.trim().length === 0) {
      diagnostics.push("where must contain a non-empty predicate for invoke_action.");
      return "FALSE";
    }
    return normalizedWhere;
  }
  const subject = isRecord(args.subject) ? args.subject : {};
  const identity = concept.identities[0];
  if (
    identity &&
    (subject[identity.name] !== undefined || args[identity.name] !== undefined || args.id !== undefined)
  ) {
    return `root.${quoteIdent(identity.name)} = ${sqlLiteral(subject[identity.name] ?? args[identity.name] ?? args.id)}`;
  }
  const entries = Object.entries(subject);
  if (entries.length > 0) {
    return entries.map(([key, value]) => `root.${quoteIdent(key)} = ${sqlLiteral(value)}`).join(" AND ");
  }
  diagnostics.push(
    `Provide subject, id, where, or ${identity?.name ?? "an identity value"} for subject:${mode} action invocation.`,
  );
  return "FALSE";
}

function subjectValue(name: string, args: Record<string, unknown>): unknown {
  const subject = isRecord(args.subject) ? args.subject : {};
  return subject[name] ?? args[name] ?? (name === "id" ? args.id : undefined);
}

function generatedIdentityValue(concept: ResolvedConcept, action: ActionDecl, identityName: string): string {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
  return `MCP_${concept.name}_${action.name}_${identityName}_${suffix}`.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 120);
}

function literalExpressionValue(expression: string): unknown {
  const trimmed = expression.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  if (quoted) return quoted[2]!;
  if (/^true$/i.test(trimmed)) return true;
  if (/^false$/i.test(trimmed)) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlMeasureExpression(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  prefix: string,
  expression: string,
  diagnostics: string[],
  aggregateAliases: Map<string, string> = new Map(),
): string {
  return sqlExpression(ctx, concept, prefix, expression, diagnostics, aggregateAliases, true);
}

function sqlExpression(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  prefix: string,
  expression: string,
  diagnostics: string[],
  aggregateAliases: Map<string, string> = new Map(),
  aggregateContext = false,
): string {
  expression = expression.replace(
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    (_match, value: string) => `'${value.replace(/'/g, "''")}'`,
  );
  const replacements = new Map<string, string>();
  const identifiers = expressionIdentifiers(expression)
    .filter((identifier) => !sqlIgnoredIdentifier(identifier))
    .sort((a, b) => b.length - a.length);
  for (const identifier of identifiers) {
    if (aggregateAliases.has(identifier)) {
      replacements.set(identifier, `(${aggregateAliases.get(identifier)!})`);
      continue;
    }
    const resolved = sqlPath(ctx, concept, prefix, identifier, diagnostics, aggregateContext, aggregateAliases);
    if (resolved) replacements.set(identifier, resolved);
  }
  let sql = replaceOutsideStrings(expression, replacements);
  sql = sql.replace(/\bis\s+not\s+null\b/gi, "IS NOT NULL");
  sql = sql.replace(/\bis\s+null\b/gi, "IS NULL");
  sql = sql.replace(/\bdate\s+'/gi, "DATE '");
  return sql;
}

function sqlPath(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  prefix: string,
  pathText: string,
  diagnostics: string[],
  aggregateContext: boolean,
  aggregateAliases: Map<string, string>,
): string | undefined {
  const segments = pathText.split(".");
  let current = concept;
  let currentPrefix = prefix;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const join = current.joins.find((candidate) => candidate.name === segment);
    if (join) {
      const joined = ensureSqlJoin(ctx, current, currentPrefix, join, diagnostics);
      if (!joined) return undefined;
      current = joined.concept;
      currentPrefix = joined.prefix;
      if (index === segments.length - 1) {
        const identity = current.identities[0];
        return identity ? `${joined.alias}.${quoteIdent(identity.name)}` : joined.alias;
      }
      continue;
    }
    const rest = segments.slice(index);
    return sqlMemberPath(ctx, current, currentPrefix, rest, diagnostics, aggregateContext, aggregateAliases);
  }
  return undefined;
}

function sqlMemberPath(
  ctx: SqlBuildContext,
  concept: ResolvedConcept,
  prefix: string,
  segments: string[],
  diagnostics: string[],
  aggregateContext: boolean,
  aggregateAliases: Map<string, string>,
): string | undefined {
  const [name, property] = segments;
  if (!name) return undefined;
  const alias = sqlAliasFor(ctx, prefix);
  if (concept.identities.some((field) => field.name === name) || concept.fields.some((field) => field.name === name)) {
    return sqlFieldProperty(`${alias}.${quoteIdent(name)}`, property);
  }
  const dimension = concept.dimensions.find((candidate) => candidate.name === name);
  if (dimension)
    return sqlFieldProperty(
      `(${sqlExpression(ctx, concept, prefix, dimension.expression, diagnostics, aggregateAliases, aggregateContext)})`,
      property,
    );
  const measure = concept.measures.find((candidate) => candidate.name === name);
  if (measure) return sqlMeasureExpression(ctx, concept, prefix, measure.expression, diagnostics, aggregateAliases);
  diagnostics.push(`Cannot lower ${concept.name}.${segments.join(".")} to SQL.`);
  return undefined;
}

function ensureSqlJoin(
  ctx: SqlBuildContext,
  source: ResolvedConcept,
  sourcePrefix: string,
  join: JoinDecl,
  diagnostics: string[],
): { concept: ResolvedConcept; alias: string; prefix: string } | undefined {
  const target = ctx.model.concepts.get(join.target) ?? roleTarget(ctx.model, join.target);
  if (!target) {
    diagnostics.push(`Join ${join.name} targets unknown concept or role ${join.target}.`);
    return undefined;
  }
  if (target.source.kind !== "table") {
    diagnostics.push(`Join ${join.name} target ${target.name} is not backed by a table source.`);
    return undefined;
  }
  if (ctx.writeContext && join.kind !== "join_one") {
    diagnostics.push(
      `Action SQL lowering cannot use ${join.kind} join ${join.name}; write selectors must not fan out target identities.`,
    );
    return undefined;
  }
  const prefix = sourcePrefix ? `${sourcePrefix}.${join.name}` : join.name;
  const existingAlias = ctx.joins.get(prefix);
  if (existingAlias) return { concept: target, alias: existingAlias, prefix };
  const alias = prefix.replace(/[^A-Za-z0-9_]/g, "__");
  ctx.joins.set(prefix, alias);
  const conditions = sqlJoinConditions(ctx, source, sourcePrefix, target, alias, join, diagnostics);
  if (conditions.length === 0 && join.kind !== "join_cross") {
    diagnostics.push(`Join ${join.name} has no SQL join condition.`);
  }
  const joinKeyword = join.kind === "join_cross" && conditions.length === 0 ? "CROSS JOIN" : "LEFT JOIN";
  const onClause = conditions.length > 0 ? ` ON ${conditions.join(" AND ")}` : "";
  ctx.joinClauses.push(`${joinKeyword} ${quoteTablePath(target.source.path)} AS ${alias}${onClause}`);
  return { concept: target, alias, prefix };
}

function sqlJoinConditions(
  ctx: SqlBuildContext,
  source: ResolvedConcept,
  sourcePrefix: string,
  target: ResolvedConcept,
  alias: string,
  join: JoinDecl,
  diagnostics: string[],
): string[] {
  const conditions: string[] = [];
  if (join.with) {
    const targetIdentity = target.identities[0];
    if (!targetIdentity) diagnostics.push(`Join ${join.name} uses with but ${target.name} has no identity.`);
    else
      conditions.push(
        `${sqlExpression(ctx, source, sourcePrefix, join.with, diagnostics)} = ${alias}.${quoteIdent(targetIdentity.name)}`,
      );
  } else if (join.on) {
    conditions.push(sqlJoinOn(ctx, source, sourcePrefix, target, alias, join.on, diagnostics));
  }
  if (join.at) {
    const period = periodAxisSql(target);
    if (period) {
      const at = sqlExpression(ctx, source, sourcePrefix, join.at, diagnostics);
      conditions.push(`${at} >= ${alias}.${quoteIdent(period.start)}`);
      conditions.push(`${at} < ${alias}.${quoteIdent(period.end)}`);
    }
  }
  return conditions;
}

function sqlJoinOn(
  ctx: SqlBuildContext,
  source: ResolvedConcept,
  sourcePrefix: string,
  target: ResolvedConcept,
  targetAlias: string,
  on: string,
  diagnostics: string[],
): string {
  return on
    .split(/\s+and\s+/i)
    .map((condition) => {
      const bare = /^([A-Za-z_][A-Za-z0-9_]*)$/.exec(condition.trim());
      if (bare) {
        const field = bare[1]!;
        return `${sqlExpression(ctx, source, sourcePrefix, field, diagnostics)} = ${targetAlias}.${quoteIdent(field)}`;
      }
      const equality = /^(.+?)\s*=\s*(.+)$/.exec(condition.trim());
      if (!equality) return sqlExpression(ctx, source, sourcePrefix, condition, diagnostics);
      const left = equality[1]!.trim();
      const right = equality[2]!.trim();
      const leftSql = sqlExpression(ctx, source, sourcePrefix, left, diagnostics);
      const rightSql = /^[A-Za-z_][A-Za-z0-9_]*$/.test(right)
        ? `${targetAlias}.${quoteIdent(right)}`
        : sqlExpression(ctx, source, sourcePrefix, right, diagnostics);
      return `${leftSql} = ${rightSql}`;
    })
    .join(" AND ");
}

function sqlFieldProperty(sql: string, property: string | undefined): string {
  if (!property) return sql;
  if (property === "date") return `CAST(${sql} AS DATE)`;
  if (property === "month") return `DATE_TRUNC('month', ${sql})`;
  if (property === "year") return `DATE_TRUNC('year', ${sql})`;
  if (property === "quarter") return `DATE_TRUNC('quarter', ${sql})`;
  if (property === "week") return `DATE_TRUNC('week', ${sql})`;
  if (property === "day") return `DATE_TRUNC('day', ${sql})`;
  return `${sql}.${property}`;
}

function sqlAliasFor(ctx: SqlBuildContext, prefix: string): string {
  return ctx.joins.get(prefix) ?? "root";
}

function replaceOutsideStrings(expression: string, replacements: Map<string, string>): string {
  let result = "";
  let token = "";
  let quote: "'" | '"' | undefined;
  const flush = () => {
    if (!token) return;
    result += replacements.get(token) ?? token;
    token = "";
  };
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index]!;
    const previous = expression[index - 1];
    if ((char === "'" || char === '"') && previous !== "\\") {
      flush();
      quote = quote === char ? undefined : (quote ?? char);
      result += char;
      continue;
    }
    if (!quote && /[A-Za-z0-9_.]/.test(char)) token += char;
    else {
      flush();
      result += char;
    }
  }
  flush();
  return result;
}

function sqlIgnoredIdentifier(identifier: string): boolean {
  return new Set([
    "sum",
    "avg",
    "count",
    "max",
    "min",
    "median",
    "concat",
    "nullif",
    "date_trunc",
    "case",
    "when",
    "then",
    "else",
    "end",
    "distinct",
    "date",
    "timestamp",
    "interval",
    "true",
    "false",
  ]).has(identifier.toLowerCase());
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function quoteTablePath(pathText: string): string {
  return pathText.split(".").map(quoteIdent).join(".");
}

function periodAxisSql(concept: ResolvedConcept): { start: string; end: string } | undefined {
  const axis = concept.temporal.find((candidate) => candidate.axis === "valid_time");
  const match = axis ? /^period\(([^,]+),\s*([^)]+)\)$/.exec(axis.expression) : undefined;
  return match ? { start: match[1]!.trim(), end: match[2]!.trim() } : undefined;
}

function modelSummary(model: SemanticModel) {
  return {
    packageName: model.packageName,
    files: model.files,
    counts: {
      ignored: model.ignored.length,
      sources: model.sources.size,
      types: model.types.size,
      concepts: model.concepts.size,
      lenses: model.lenses.size,
      queries: model.queries.length,
    },
    ignored: model.ignored.map((ignored) => ({
      source: ignored.source.expression,
      sourceKind: ignored.source.kind,
      reason: ignored.reason ?? null,
      location: ignored.location,
    })),
    sources: [...model.sources.keys()],
    types: [...model.types.keys()],
    concepts: [...model.concepts.keys()],
    lenses: [...model.lenses.keys()],
    queries: model.queries.map((query) => query.name),
  };
}

function describeConceptPlain(
  model: SemanticModel,
  concept: ResolvedConcept,
  options: { includeStats?: boolean; stats?: FieldStatsIndex } = {},
) {
  const includeStats = options.includeStats ?? true;
  const memberStats = (kind: IndexedMemberKind, member: string) =>
    options.stats?.get(fieldStatsKey(concept.name, kind, member));
  const annotateMember = <T extends { name: string; indexed?: boolean }>(kind: IndexedMemberKind, member: T) => {
    if (!member.indexed) return member;
    const stats = memberStats(kind, member.name);
    return includeStats
      ? { ...member, statsAvailable: Boolean(stats), stats: stats ?? null }
      : { ...member, statsAvailable: Boolean(stats) };
  };
  return {
    name: concept.name,
    description: concept.description ?? null,
    stereotype: concept.stereotype,
    phaseParent: concept.phaseParent ?? null,
    sourceName: concept.sourceName,
    source: sourceDescription(model, concept.source),
    identities: concept.identities,
    fields: concept.fields.map((field) => annotateMember("field", field)),
    joins: concept.joins,
    roles: concept.roles,
    dimensions: concept.dimensions.map((dimension) => annotateMember("dimension", dimension)),
    measures: concept.measures.map((measure) => annotateMember("measure", measure)),
    views: concept.views.map((view) => ({ name: view.name, body: view.body, location: view.location })),
    validations: concept.validations,
    temporal: concept.temporal,
    actions: concept.actions.map((action) => describeActionPlain(concept, action)),
    where: concept.where,
    roleBaseNames: [...concept.roleBaseNames],
  };
}

function describeActionPlain(concept: ResolvedConcept, action: ActionDecl) {
  return {
    concept: concept.name,
    name: action.name,
    description: action.description ?? null,
    subject: action.subject
      ? {
          mode: action.subject.mode,
          metadata: action.subject.metadata,
          location: action.subject.location,
        }
      : null,
    params: action.params,
    guards: action.guards,
    edits: action.edits.map((edit) => {
      if (edit.kind === "set") {
        return {
          ...edit,
          writeTargets: describeActionTargetWriteMappings(concept, edit.target),
        };
      }
      if (edit.kind === "delete") return edit;
      return {
        ...edit,
        assignments: edit.assignments.map((assignment) => ({
          ...assignment,
          writeTargets: describeActionTargetWriteMappings(concept, assignment.target),
        })),
      };
    }),
    writeTargets: [
      ...new Set(
        action.edits.flatMap((edit) =>
          edit.kind === "set"
            ? [edit.target]
            : edit.kind === "insert"
              ? edit.assignments.map((assignment) => assignment.target)
              : [],
        ),
      ),
    ].map((target) => ({
      target,
      mappings: describeActionTargetWriteMappings(concept, target),
    })),
    logs: action.logBlocks,
    effects: action.effectBlocks,
    agent: action.agentBlock ?? null,
    agentMetadata: action.agentMetadata,
    location: action.location,
  };
}

function describeActionTargetWriteMappings(concept: ResolvedConcept, target: string) {
  const field = concept.fields.find((candidate) => candidate.name === target);
  const dimension = concept.dimensions.find((candidate) => candidate.name === target);
  const member = field ?? dimension;
  if (!member) return [];
  return (
    member.writeMappings.length > 0 ? member.writeMappings : [{ kind: "default" as const, location: member.location }]
  ).map((mapping) => ({
    ...mapping,
    member: target,
    memberKind: field ? "field" : "dimension",
    writeable: member.writeable,
  }));
}

function describeLensPlain(lens: LensDecl) {
  return {
    name: lens.name,
    parents: lens.parents,
    description: lens.description ?? null,
    types: lens.types,
    refinements: describeLensRefinements(lens),
    location: lens.location,
  };
}

function describeLensRefinements(lens: LensDecl | undefined) {
  if (!lens) return [];
  return lens.refinements.map((refinement) => ({
    lens: lens.name,
    concept: refinement.conceptName,
    identities: refinement.members.identities.map((item) => item.name),
    fields: refinement.members.fields.map((item) => item.name),
    joins: refinement.members.joins.map((item) => item.name),
    roles: refinement.members.roles.map((item) => item.name),
    dimensions: refinement.members.dimensions.map((item) => item.name),
    measures: refinement.members.measures.map((item) => item.name),
    views: refinement.members.views.map((item) => item.name),
    validations: refinement.members.validations.map((item) => item.name),
    temporal: refinement.members.temporal.map((item) => item.axis),
    where: refinement.members.where.map((item) => item.expression),
    location: refinement.location,
  }));
}

function sourceDescription(model: SemanticModel, source: SourceExpression): Record<string, unknown> {
  if (source.kind === "reference") {
    return {
      ...source,
      referencedSource: model.sources.has(source.name) ? model.sources.get(source.name) : null,
      referencedConcept: model.concepts.has(source.name) ? source.name : null,
      referencedQuery: model.queries.some((query) => query.name === source.name) ? source.name : null,
    };
  }
  return source;
}

function roleDescriptions(model: SemanticModel) {
  return [...model.concepts.values()].flatMap((concept) =>
    concept.roles.map((role) => ({
      concept: concept.name,
      name: role.name,
      qualifiedName: qualifiedRoleName(concept.name, role.name),
      label: role.label ?? null,
      aliases: role.aliases,
      predicate: role.predicate,
      location: role.location,
    })),
  );
}

function resolveEntities(model: SemanticModel, name: string) {
  const matches: Array<Record<string, unknown>> = [];
  const include = entitySearchPredicate(name);
  for (const ignored of model.ignored)
    if (include(ignored.source.expression) || include(ignored.reason ?? ""))
      matches.push({ kind: "ignored", name: ignored.source.expression, ignored });
  for (const [sourceName, source] of model.sources)
    if (include(sourceName)) matches.push({ kind: "source", name: sourceName, source });
  for (const [typeName, type] of model.types)
    if (include(typeName)) matches.push({ kind: "type", name: typeName, type });
  for (const [conceptName, concept] of model.concepts) {
    if (include(conceptName)) matches.push({ kind: "concept", name: conceptName, concept: conceptSummary(concept) });
    for (const member of memberSearchItems(concept)) {
      if (include(member.name) || include(member.text))
        matches.push({ kind: member.kind, name: member.name, concept: conceptName, value: member.value });
    }
  }
  for (const [lensName, lens] of model.lenses)
    if (include(lensName)) matches.push({ kind: "lens", name: lensName, lens: describeLensPlain(lens) });
  matches.push(...queryEntityMatches(model.queries, include));
  return matches;
}

type EntityNameMatcher = (candidate: string) => boolean;

function entitySearchPredicate(name: string): (candidate: string) => boolean {
  const lower = name.toLowerCase();
  return (candidate: string) => !name || candidate.toLowerCase() === lower || candidate.toLowerCase().includes(lower);
}

function queryEntityMatches(queries: QueryDecl[], include: EntityNameMatcher): Array<Record<string, unknown>> {
  return queries.filter((query) => include(query.name)).map((query) => ({ kind: "query", name: query.name, query }));
}

async function resolveBusinessEntity(
  model: SemanticModel,
  filePath: string | undefined,
  conceptName: string | undefined,
  businessName: string | undefined,
  fieldStats?: FieldStatsIndex,
) {
  const concepts = conceptName
    ? [...model.concepts.values()].filter((concept) => concept.name === conceptName)
    : (searchModel(model, businessName ?? "", 8)
        .concepts.map((match) => model.concepts.get(match.name))
        .filter(Boolean) as ResolvedConcept[]);
  const businessTokens = tokenize(businessName ?? "");
  const data = filePath ? await exampleDuckDbScripts(filePath) : undefined;
  const candidates = await Promise.all(
    concepts.map(async (concept) => {
      const identifiers = [
        ...concept.identities,
        ...concept.fields.filter((field) => field.unique || /(^|_)(id|key|code|number|name)$/i.test(field.name)),
      ];
      const candidateFields = [...concept.fields, ...concept.dimensions].filter((field) => {
        const fieldText = `${field.name} ${"expression" in field ? field.expression : field.typeName}`.toLowerCase();
        return (
          businessTokens.length === 0 ||
          businessTokens.some((token) => fieldText.includes(token)) ||
          /name|label|code|region|city|state|status|type|market/i.test(field.name)
        );
      });
      const rows =
        data && concept.source.kind === "table" && businessName
          ? await lookupBusinessEntityRows(model, concept, candidateFields, businessName, data)
          : [];
      return {
        concept: concept.name,
        sourceName: concept.sourceName,
        identifiers: identifiers.map((field) => ({
          name: field.name,
          typeName: field.typeName,
          description: field.description ?? null,
          unique: "unique" in field ? field.unique : true,
        })),
        candidateFields: candidateFields.map((field) => ({
          name: field.name,
          kind: "expression" in field ? "dimension" : "field",
          description: field.description ?? null,
          typeName: field.typeName ?? null,
          expression: "expression" in field ? field.expression : null,
        })),
        rows,
        roles: concept.roles.map((role) => ({
          name: role.name,
          qualifiedName: qualifiedRoleName(concept.name, role.name),
          label: role.label ?? null,
          aliases: role.aliases,
          predicate: role.predicate,
        })),
      };
    }),
  );
  return {
    ok: concepts.length > 0,
    concept: conceptName ?? null,
    business_name: businessName ?? null,
    candidates,
    predicates: searchPredicateMatches(fieldStats, businessName ?? "", 20, conceptName),
    note: data
      ? "Resolved against local DuckDB example data when matching rows were available."
      : "No local DuckDB example data was available; returned ontology-backed candidates.",
  };
}

async function lookupBusinessEntityRows(
  model: SemanticModel,
  concept: ResolvedConcept,
  candidateFields: Array<{ name: string; expression?: string }>,
  businessName: string,
  data: { schema: string; sampleData: string; schemaPath: string },
): Promise<Array<Record<string, unknown>>> {
  if (concept.source.kind !== "table") return [];
  const ctx: SqlBuildContext = { model, root: concept, joins: new Map([["", "root"]]), joinClauses: [] };
  const diagnostics: string[] = [];
  const selectFields = [
    ...concept.identities.map((field) => field.name),
    ...concept.fields
      .filter((field) => /name|label|code|region|market|city|state|status|type/i.test(field.name))
      .map((field) => field.name),
  ];
  const select = [...new Set(selectFields)].map((field) => `root.${quoteIdent(field)} AS ${quoteIdent(field)}`);
  const searchable = candidateFields.map((field) => ({
    name: field.name,
    sql: field.expression
      ? sqlExpression(ctx, concept, "", field.expression, diagnostics)
      : `root.${quoteIdent(field.name)}`,
  }));
  if (diagnostics.length > 0 || searchable.length === 0) return [];
  const escaped = businessName.replace(/'/g, "''").toLowerCase();
  const where = searchable.map((field) => `LOWER(CAST(${field.sql} AS VARCHAR)) LIKE '%${escaped}%'`).join(" OR ");
  const sql = [
    `SELECT ${select.length > 0 ? select.join(", ") : "*"}`,
    `FROM ${quoteIdent(concept.source.path)} AS root`,
    `WHERE ${where}`,
    "LIMIT 10;",
  ].join("\n");
  try {
    const { stdout } = await execFileAsync("duckdb", ["-json", "-c", `${data.schema}\n${data.sampleData}\n${sql}`], {
      cwd: path.dirname(data.schemaPath),
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim() || "[]") as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

function searchModel(model: SemanticModel, text: string, limit: number, fieldStats?: FieldStatsIndex) {
  const tokens = tokenize(text);
  const concepts = scored(conceptSearchItems(model), tokens, limit);
  const metrics = scored(
    [...model.concepts.values()].flatMap((concept) =>
      concept.measures.map((measure) => ({
        concept: concept.name,
        name: measure.name,
        description: measure.description ?? null,
        expression: measure.expression,
        text: `${concept.name} ${measure.name} ${measure.description ?? ""} ${measure.expression}`,
      })),
    ),
    tokens,
    limit,
  );
  const members = scored(
    [...model.concepts.values()].flatMap((concept) =>
      memberSearchItems(concept).map((member) => ({
        concept: concept.name,
        kind: member.kind,
        name: member.name,
        text: `${concept.name} ${member.kind} ${member.name} ${member.text}`,
      })),
    ),
    tokens,
    limit,
  );
  const queries = scored(
    model.queries.map((query) => ({
      name: query.name,
      root: query.root,
      lenses: query.lenses,
      text: `${query.name} ${query.root} ${query.lenses.join(" ")} ${queryBodySearchText(query.body)}`,
    })),
    tokens,
    limit,
  );
  const ignored = scored(
    model.ignored.map((ignoredSource) => ({
      source: ignoredSource.source.expression,
      sourceKind: ignoredSource.source.kind,
      reason: ignoredSource.reason ?? null,
      text: `${ignoredSource.source.expression} ${ignoredSource.reason ?? ""} ${ignoredSource.metadata.map((entry) => `${entry.key} ${entry.value}`).join(" ")}`,
    })),
    tokens,
    limit,
  );
  const lenses = scoreLenses(model, text, limit);
  const predicates = searchPredicateMatches(fieldStats, text, limit);
  return { concepts, metrics, members, queries, lenses, ignored, predicates };
}

function searchPredicateMatches(
  fieldStats: FieldStatsIndex | undefined,
  text: string,
  limit: number,
  conceptName?: string,
) {
  const tokens = tokenize(text);
  if (!fieldStats || tokens.length === 0) return [];
  return scored(
    [...fieldStats.values()]
      .flatMap((entry) =>
        entry.memberKind === "measure"
          ? []
          : (entry.values?.values ?? [])
              .filter((value): value is FieldStatsValue & { value: string } => typeof value.value === "string")
              .map((value) => ({
                concept: entry.concept,
                member: entry.member,
                memberKind: entry.memberKind,
                value: value.value,
                predicate: `${entry.member} = ${sqlLiteral(value.value)}`,
                text: `${entry.concept} ${entry.member} ${value.value}`,
              })),
      )
      .filter((item) => !conceptName || item.concept === conceptName),
    tokens,
    limit,
  );
}

function scoreLenses(model: SemanticModel, text: string, limit: number) {
  const tokens = tokenize(text);
  return scored(
    [...model.lenses.values()].map((lens) => ({
      name: lens.name,
      description: lens.description ?? null,
      parents: lens.parents,
      refinedConcepts: lens.refinements.map((refinement) => refinement.conceptName),
      text: [
        lens.name,
        lens.description ?? "",
        lens.parents.join(" "),
        lens.types
          .map((type) => `${type.name} ${type.metadata.map((item) => `${item.key} ${item.value}`).join(" ")}`)
          .join(" "),
        lens.refinements
          .map((refinement) => `${refinement.conceptName} ${conceptMembersSearchText(refinement.members)}`)
          .join(" "),
      ].join(" "),
    })),
    tokens,
    limit,
  );
}

function lensRequiredFields(lens: LensDecl, requestedFields: string[] = []) {
  const requested = requestedFields.map((field) => field.toLowerCase());
  return lens.refinements.map((refinement) => {
    const exposed = [
      ...refinement.members.identities.map((item) => ({
        field: item.name,
        kind: "identity",
        typeName: item.typeName,
        expression: null,
      })),
      ...refinement.members.fields.map((item) => ({
        field: item.name,
        kind: "field",
        typeName: item.typeName,
        expression: null,
      })),
      ...refinement.members.roles.map((item) => ({
        field: item.name,
        kind: "role",
        typeName: null,
        expression: item.predicate,
      })),
      ...refinement.members.dimensions.map((item) => ({
        field: item.name,
        kind: "dimension",
        typeName: item.typeName ?? null,
        expression: item.expression,
      })),
      ...refinement.members.measures.map((item) => ({
        field: item.name,
        kind: "measure",
        typeName: item.typeName ?? null,
        expression: item.expression,
      })),
      ...refinement.members.temporal.map((item) => ({
        field: item.axis,
        kind: "temporal_axis",
        typeName: null,
        expression: item.expression,
      })),
    ];
    const expressions = [
      ...refinement.members.where.map((item) => item.expression),
      ...refinement.members.joins.flatMap((item) => [item.on, item.at ?? ""]),
      ...refinement.members.roles.map((item) => item.predicate),
      ...refinement.members.dimensions.map((item) => item.expression),
      ...refinement.members.measures.map((item) => item.expression),
      ...refinement.members.validations.map((item) => item.predicate ?? ""),
      ...refinement.members.temporal.map((item) => item.expression),
      ...refinement.members.views.map((item) => queryBodySearchText(item.body)),
    ];
    const required = [...new Set(expressions.flatMap(expressionIdentifiers))];
    const matches =
      requested.length === 0
        ? []
        : requestedFields
            .map((field) => {
              const lower = field.toLowerCase();
              return {
                field,
                exposedAs: exposed.filter((item) => fieldMatches(lower, item.field)),
                requiredByExpressions: expressions.filter((expression) =>
                  expressionIdentifiers(expression).some((identifier) => fieldMatches(lower, identifier)),
                ),
              };
            })
            .filter((item) => item.exposedAs.length > 0 || item.requiredByExpressions.length > 0);
    return {
      lens: lens.name,
      concept: refinement.conceptName,
      matches,
      expressions: expressions.filter(Boolean),
      requiredFields: required,
      exposedFields: exposed,
    };
  });
}

function modelWithLenses(model: SemanticModel, lenses: string[], root?: string): LensModelResult {
  if (lenses.length === 0) return { ok: true, model, diagnostics: [] };
  const diagnostics: Diagnostic[] = [];
  const query: QueryDecl = {
    name: "__mcp_lens_expansion",
    root: root && model.concepts.has(root) ? root : ([...model.concepts.keys()][0] ?? "__missing_root"),
    lenses,
    body: emptyQueryBody(),
    location: { line: 1, column: 1 },
  };
  const expanded = applyQueryLenses(model, query, diagnostics);
  if (!expanded) return { ok: false, diagnostics: jsonSafe(diagnostics), error: "Unable to apply requested lenses." };
  if (hasErrors(diagnostics))
    return { ok: false, diagnostics: jsonSafe(diagnostics), error: "Lens expansion produced diagnostics." };
  return { ok: true, model: expanded, diagnostics };
}

function findConceptPaths(model: SemanticModel, from: string, to: string, maxDepth: number) {
  const start = model.concepts.get(from) ?? roleTarget(model, from);
  if (!start) return [];
  const paths: unknown[] = [];
  const queue: Array<{ concept: ResolvedConcept; steps: unknown[]; seen: Set<string> }> = [
    { concept: start, steps: [], seen: new Set([start.name]) },
  ];
  while (queue.length > 0 && paths.length < 25) {
    const current = queue.shift()!;
    if (current.steps.length >= maxDepth) continue;
    for (const join of current.concept.joins) {
      const target = model.concepts.get(join.target) ?? roleTarget(model, join.target);
      if (!target) continue;
      const step = {
        from: current.concept.name,
        join: join.name,
        kind: join.kind,
        optional: join.optional,
        target: join.target,
        targetConcept: target.name,
        on: join.on,
        at: join.at ?? null,
      };
      const nextSteps = [...current.steps, step];
      if (target.name === to || join.target === to || target.roles.some((role) => role.name === to))
        paths.push({
          concepts: [start.name, ...nextSteps.map((item) => (item as { targetConcept: string }).targetConcept)],
          steps: nextSteps,
        });
      if (!current.seen.has(target.name))
        queue.push({ concept: target, steps: nextSteps, seen: new Set([...current.seen, target.name]) });
    }
  }
  return paths;
}

function roleTarget(model: SemanticModel, roleName: string): ResolvedConcept | undefined {
  for (const concept of model.concepts.values()) {
    if (concept.roles.some((role) => role.name === roleName)) return concept;
  }
  return undefined;
}

function conceptByName(model: SemanticModel, name: string | undefined): ResolvedConcept | undefined {
  if (!name) return undefined;
  return model.concepts.get(name);
}

function conceptSummary(concept: ResolvedConcept) {
  return {
    name: concept.name,
    description: concept.description ?? null,
    stereotype: concept.stereotype,
    sourceName: concept.sourceName,
    identities: concept.identities.map((item) => item.name),
    fields: concept.fields.map((item) => item.name),
    joins: concept.joins.map((item) => item.name),
    roles: concept.roles.map((item) => ({
      name: item.name,
      qualifiedName: qualifiedRoleName(concept.name, item.name),
      label: item.label ?? null,
      aliases: item.aliases,
    })),
    dimensions: concept.dimensions.map((item) => item.name),
    measures: concept.measures.map((item) => item.name),
    views: concept.views.map((item) => item.name),
    actions: concept.actions.map((item) => item.name),
  };
}

function emptyQueryBody(): QueryBodyDecl {
  return { select: [], groupBy: [], aggregate: [], calculate: [], orderBy: [] };
}

function fieldMatches(requestedLower: string, candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return lower === requestedLower || lower.endsWith(`.${requestedLower}`) || lower.split(".").at(-1) === requestedLower;
}

function actionQueryLimitSecondsValue(args: Record<string, unknown>): QueryLimitSecondsResult {
  return readQueryLimitSeconds(args, {
    required: false,
    defaultValue: defaultActionQueryLimitSeconds,
    toolName: "invoke_action",
  });
}

function readQueryLimitSeconds(
  args: Record<string, unknown>,
  options: QueryLimitSecondsOptions,
): QueryLimitSecondsResult {
  const raw =
    args.query_limit_seconds ??
    args.queryLimitSeconds ??
    args.query_time_limit_seconds ??
    args.queryTimeLimitSeconds ??
    args.query_time_limit ??
    args.queryTimeLimit;
  if (raw === undefined) {
    return options.required
      ? {
          ok: false,
          error: `${options.toolName} requires query_limit_seconds as a positive integer number of seconds.`,
        }
      : { ok: true, value: options.defaultValue };
  }
  const parsed = positiveIntegerSecondsValue(raw);
  if (parsed === undefined) {
    const prefix = options.invalidErrorPrefix ?? `${options.toolName} `;
    return {
      ok: false,
      error: `${prefix}query_limit_seconds must be a positive integer number of seconds no greater than ${maxQueryLimitSeconds}.`,
    };
  }
  return { ok: true, value: parsed };
}

function positiveIntegerSecondsValue(raw: unknown): number | undefined {
  const parsed = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maxQueryLimitSeconds
    ? parsed
    : undefined;
}

function notFound(kind: string, name: unknown, model: SemanticModel): Record<string, JsonValue> {
  return {
    ok: false,
    error: `No ${kind} found for ${typeof name === "string" ? name : JSON.stringify(name)}.`,
    context: jsonSafe(modelSummary(model)),
  };
}
