/*
 * Purpose: Defines the SemLang MCP API, tool registry, context lifecycle, and tool-level orchestration.
 * Encapsulation: Keep MCP request handling and composition here; generic argument utilities, Malloy execution, and shared language constants belong in separate modules.
 */

import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { applyQueryLenses, compileFile, compileSemLang, emitMalloy, filePackageLoader } from "./index.js";
import {
  discoverMalloyConfigPath,
  executeMalloyQuery,
  executeMalloySql,
  validateMalloyModel,
} from "./malloy-execution.js";
import { logTransaction } from "./logging.js";
import {
  booleanValue,
  hasErrors,
  isRecord,
  jsonSafe,
  numberValue,
  prettyJsonLineCount,
  resolved,
  resolveOptionalPath,
  stringList,
  stringValue,
  type JsonValue,
} from "./mcp-utils.js";
import { qualifiedRoleName } from "./roles.js";
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
export type SemLangMcpTool = (args?: Record<string, unknown>) => Promise<Record<string, JsonValue>>;

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
  duckDb?: ExampleDuckDbContext;
  settings: SemLangMcpSettings;
}

export interface SemLangMcpSettings {
  projectDir: string;
  malloyConfigPath?: string;
  exportDirectory: string;
}

export interface SemLangMcpApi {
  tools: Record<string, SemLangMcpTool>;
  toolDescriptions: Record<string, string>;
  getContext(): SemLangMcpContext;
}

type QueryLimitSecondsResult = { ok: true; value: number } | { ok: false; error: string };

interface ToolSpec {
  name: string;
  description: string;
  handler: SemLangMcpTool;
}

interface ExampleDuckDbContext {
  sourceDir: string;
  dbPath: string;
  schemaPath: string;
}

type LensModelResult =
  | { ok: true; model: SemanticModel; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: JsonValue; error: string };

type TemporaryQueryResult =
  | { ok: true; queryName: string; queryText: string; root: string; lenses: string[] }
  | { ok: false; error: string; candidates?: JsonValue; note?: string };

const maxSearchResults = 20;
const defaultActionQueryLimitSeconds = 30;

export function createSemLangMcp(settings: Partial<SemLangMcpSettings> = {}): SemLangMcpApi {
  const context: SemLangMcpContext = { settings: resolveSemLangMcpSettings(settings) };

  function requireModel(): SemanticModel {
    if (!context.model) throw new Error("No ontology source has been set. Call set_ontology_source first.");
    return context.model;
  }

  async function compileSource(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const paths = stringList(args.paths ?? args.path ?? args.filePaths ?? args.filePath);
    const inlineSources = stringList(args.sources ?? args.source);
    const inlineSource = inlineSources.length > 0 ? inlineSources.join("\n\n") : undefined;
    const explicitFilePath = stringValue(args.basePath ?? args.filePath);
    const requestedProjectDir = resolveOptionalPath(
      stringValue(args.projectDir ?? args.project_dir ?? args.projectPath ?? args.project_path),
    );
    const explicitMalloyConfigPath =
      stringValue(args.malloyConfigPath ?? args.malloy_config_path ?? args.configPath ?? args.config_path) ??
      context.settings.malloyConfigPath;

    let result: CompileResult;
    let sourceText: string | undefined;
    let filePath: string | undefined;
    let sourcePaths: string[];
    let sourceKind: SemLangMcpContext["sourceKind"];

    if (paths.length > 0) {
      const absolutePaths = paths.map((item) => path.resolve(item));
      sourcePaths = absolutePaths;
      if (absolutePaths.length === 1 && !inlineSource) {
        filePath = absolutePaths[0];
        sourceText = await fs.readFile(filePath, "utf8");
        result = await compileFile(filePath, { lintWarnings: true });
        sourceKind = "file";
      } else {
        filePath = path.join(process.cwd(), "__semlang_mcp_context__.semlang");
        sourceText = [
          "package semlang.mcp.context",
          ...absolutePaths.map((item) => `include ${JSON.stringify(item)}`),
          inlineSource ?? "",
        ]
          .filter(Boolean)
          .join("\n");
        result = await compileSemLang(sourceText, { filePath, packageLoader: filePackageLoader(), lintWarnings: true });
        sourceKind = absolutePaths.length > 0 ? "files" : "inline";
      }
    } else if (inlineSource) {
      filePath = explicitFilePath
        ? path.resolve(explicitFilePath)
        : path.join(process.cwd(), "__semlang_mcp_inline__.semlang");
      sourcePaths = explicitFilePath ? [filePath] : [];
      sourceText = inlineSource;
      result = await compileSemLang(sourceText, { filePath, packageLoader: filePackageLoader(), lintWarnings: true });
      sourceKind = "inline";
    } else {
      return { ok: false, error: "Provide path/paths or source/sources." };
    }

    let executionContext: Extract<ResolvedMalloyExecutionContext, { ok: true }> | undefined;
    if (result.model) {
      const explicitProjectDir = projectDirDiscoveryCeiling(
        sourcePaths,
        result.model.files,
        requestedProjectDir,
        context.settings.projectDir,
      );
      const resolvedExecutionContext = await resolveMalloyExecutionContext(
        explicitProjectDir,
        explicitMalloyConfigPath,
        sourcePaths,
        result.model.files,
      );
      if (!resolvedExecutionContext.ok) {
        return {
          ok: false,
          diagnostics: jsonSafe(result.diagnostics),
          error: resolvedExecutionContext.error,
          context: null,
        };
      }
      executionContext = resolvedExecutionContext;
      if (result.malloy) {
        const malloyDiagnostics = await validateMalloyModel({
          malloy: result.malloy,
          context: {
            projectDir: executionContext.projectDir,
            malloyConfigPath: executionContext.malloyConfigPath,
            malloyConfigSource: executionContext.source,
            modelFilePath: filePath,
          },
          sourceMap: result.malloySourceMap,
        });
        result.diagnostics.push(...malloyDiagnostics);
      }
    }

    const ok = Boolean(result.model) && !hasErrors(result.diagnostics);
    if (ok && result.model && executionContext) {
      context.compileResult = result;
      context.model = result.model;
      context.malloy = result.malloy;
      context.malloySourceMap = result.malloySourceMap;
      context.sourceText = sourceText;
      context.filePath = filePath;
      context.sourcePaths = sourcePaths;
      context.sourceKind = sourceKind;
      context.projectDir = executionContext.projectDir;
      context.malloyConfigPath = executionContext.malloyConfigPath;
      context.malloyConfigSource = executionContext.source;
    }

    const response: Record<string, JsonValue> = {
      ok,
      diagnostics: jsonSafe(result.diagnostics),
      context:
        result.model && executionContext
          ? jsonSafe({
              ...modelSummary(result.model),
              execution: {
                projectDir: executionContext.projectDir,
                malloyConfigPath: executionContext.malloyConfigPath,
                malloyConfigSource: executionContext.source,
              },
            })
          : null,
    };
    if (booleanValue(args.return_malloy_model ?? args.returnMalloyModel)) {
      response.malloyModel = result.malloy ?? null;
    }
    return response;
  }

  function semanticSearchTerms(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const text = stringValue(args.question ?? args.query ?? args.phrase ?? args.text) ?? "";
    const limit = numberValue(args.limit) ?? maxSearchResults;
    const matches = searchModel(model, text, limit);
    return resolved({ ok: true, query: text, ...matches });
  }

  async function resolveEntity(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const conceptName = stringValue(args.concept);
    const businessName = stringValue(args.business_name ?? args.businessName);
    if (conceptName || businessName)
      return jsonSafe(await resolveBusinessEntity(model, context.filePath, conceptName, businessName)) as Record<
        string,
        JsonValue
      >;
    const name = stringValue(args.entity ?? args.name ?? args.term) ?? "";
    return resolved({ ok: true, entity: name, matches: jsonSafe(resolveEntities(model, name)) });
  }

  function describeConcept(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const baseModel = requireModel();
    const lenses = stringList(args.lenses ?? args.lens);
    const modelResult = modelWithLenses(baseModel, lenses, stringValue(args.concept ?? args.name));
    if (!modelResult.ok) return resolved(modelResult);
    const concept = conceptByName(modelResult.model, stringValue(args.concept ?? args.name));
    if (!concept) return resolved(notFound("concept", args.concept ?? args.name, modelResult.model));
    return resolved({ ok: true, lenses, concept: jsonSafe(describeConceptPlain(modelResult.model, concept)) });
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

  function suggestLens(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const text = stringValue(args.user_context ?? args.context ?? args.question ?? args.phrase ?? args.text) ?? "";
    return resolved({
      ok: true,
      query: text,
      lenses: jsonSafe(scoreLenses(model, text, numberValue(args.limit) ?? 8)),
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

  async function runQuery(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const transactionId = crypto.randomUUID();
    logTransaction("info", transactionId, "query.run requested", { tool: "query.run" });
    const validation = await validateOrRunQuery(args);
    if (booleanValue(args.dry_run_only ?? args.dryRunOnly)) {
      logTransaction("debug", transactionId, "query.run skipped for dry_run_only", { tool: "query.run" });
      return {
        ...publicQueryResult(validation),
        execution: {
          transactionId,
          skipped: true,
          reason: "dry_run_only requested; query was validated but not executed.",
        },
      };
    }
    const queryLimitSeconds = queryLimitSecondsValue(args);
    if (!queryLimitSeconds.ok) {
      logTransaction("info", transactionId, "query.run rejected before execution", { tool: "query.run" });
      return {
        ...queryLimitSeconds,
        execution: {
          transactionId,
          skipped: true,
          reason: "query_limit_seconds validation failed.",
        },
      };
    }
    const execution = await executeQuery(context, args, validation, queryLimitSeconds.value, transactionId);
    const compactExecution = await compactExecutionOutput(context, args, execution, transactionId);
    logTransaction("info", transactionId, "query.run completed", { tool: "query.run" });
    return { ...publicQueryResult(validation), execution: jsonSafe(compactExecution) };
  }

  async function invokeAction(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const actionName = stringValue(args.action ?? args.name);
    const resolvedAction = resolveAction(model, stringValue(args.concept), actionName);
    if (!resolvedAction.ok) return jsonSafe(resolvedAction) as Record<string, JsonValue>;
    const executionContext = actionExecutionContext(context);
    if (!executionContext.ok) return executionContext;
    const built = buildActionSql(model, resolvedAction.concept, resolvedAction.action, args);
    if (!built.ok) {
      return {
        ok: false,
        engine: "malloy",
        action: resolvedAction.action.name,
        concept: resolvedAction.concept.name,
        diagnostics: jsonSafe(built.diagnostics),
      };
    }
    if (booleanValue(args.dry_run_only ?? args.dryRunOnly)) {
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
    const queryLimitSeconds = actionQueryLimitSecondsValue(args);
    if (!queryLimitSeconds.ok) return queryLimitSeconds;
    let rows: Array<Record<string, unknown>> = [];
    if (built.rowsQuery) {
      const selected = await executeMalloySql({
        context: executionContext.context,
        connectionName: built.connectionName,
        sql: built.rowsQuery,
        queryLimitSeconds: queryLimitSeconds.value,
      });
      if (selected.ok !== true) {
        return {
          ok: false,
          engine: "malloy",
          action: resolvedAction.action.name,
          concept: resolvedAction.concept.name,
          operation: built.operation,
          sql: built.sql,
          diagnostics: jsonSafe(built.diagnostics),
          query_limit_seconds: (selected.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds.value,
          timed_out: (selected.timed_out as JsonValue | undefined) ?? false,
          error: selected.error,
        };
      }
      rows = Array.isArray(selected.rows) ? (selected.rows as Array<Record<string, unknown>>) : [];
      if (rows.length === 0) {
        return {
          ok: false,
          engine: "malloy",
          action: resolvedAction.action.name,
          concept: resolvedAction.concept.name,
          operation: built.operation,
          sql: built.sql,
          changedRowCount: 0,
          query_limit_seconds: (selected.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds.value,
          timed_out: (selected.timed_out as JsonValue | undefined) ?? false,
          rows: [],
          diagnostics: jsonSafe([
            ...built.diagnostics,
            "Action matched no rows; the subject may not exist or a guard may have failed.",
          ]),
          verificationQuery: built.verificationQuery ?? null,
        };
      }
    }
    const execution = await executeMalloySql({
      context: executionContext.context,
      connectionName: built.connectionName,
      sql: built.sql,
      queryLimitSeconds: queryLimitSeconds.value,
    });
    if (execution.ok !== true) {
      return {
        ok: false,
        engine: "malloy",
        action: resolvedAction.action.name,
        concept: resolvedAction.concept.name,
        operation: built.operation,
        sql: built.sql,
        diagnostics: jsonSafe(built.diagnostics),
        query_limit_seconds: (execution.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds.value,
        timed_out: (execution.timed_out as JsonValue | undefined) ?? false,
        error: execution.error,
      };
    }
    const matchedRowCount = rows.length;
    if (rows.length === 0 && Array.isArray(execution.rows)) rows = execution.rows as Array<Record<string, unknown>>;
    if (built.operation !== "delete" && built.verificationQuery) {
      const selected = await executeMalloySql({
        context: executionContext.context,
        connectionName: built.connectionName,
        sql: built.verificationQuery,
        queryLimitSeconds: queryLimitSeconds.value,
      });
      if (selected.ok === true && Array.isArray(selected.rows)) rows = selected.rows as Array<Record<string, unknown>>;
    }
    const changedRowCount = matchedRowCount || rows.length;
    try {
      return {
        ok: changedRowCount > 0,
        engine: "malloy",
        action: resolvedAction.action.name,
        concept: resolvedAction.concept.name,
        operation: built.operation,
        sql: built.sql,
        changedRowCount,
        query_limit_seconds: (execution.query_limit_seconds as JsonValue | undefined) ?? queryLimitSeconds.value,
        timed_out: (execution.timed_out as JsonValue | undefined) ?? false,
        rows: jsonSafe(rows),
        diagnostics: jsonSafe(
          changedRowCount > 0
            ? built.diagnostics
            : [...built.diagnostics, "Action matched no rows; the subject may not exist or a guard may have failed."],
        ),
        verificationQuery: built.verificationQuery ?? null,
      };
    } catch {
      return {
        ok: false,
        engine: "malloy",
        action: resolvedAction.action.name,
        concept: resolvedAction.concept.name,
        operation: built.operation,
        sql: built.sql,
        diagnostics: jsonSafe(built.diagnostics),
        error: "Action execution returned rows in an unexpected format.",
      };
    }
  }

  async function validateOrRunQuery(args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const name = stringValue(args.query ?? args.name);
    const query = name ? model.queries.find((candidate) => candidate.name === name) : undefined;
    if (
      query &&
      !args.body &&
      !args.queryBody &&
      !args.root &&
      !args.concept &&
      !args.source &&
      !args.lens &&
      !args.lenses &&
      !args.with &&
      !hasQueryBodyKeys(args)
    ) {
      const diagnostics: Diagnostic[] = [];
      const queryModel = query.lenses.length > 0 ? applyQueryLenses(model, query, diagnostics) : model;
      const emitted = queryModel ? emitMalloy(model) : { malloy: "", diagnostics };
      const allDiagnostics = [...diagnostics, ...emitted.diagnostics];
      return {
        ok: !hasErrors(allDiagnostics),
        query: jsonSafe(query),
        diagnostics: jsonSafe(allDiagnostics),
        malloy: emitted.malloy,
        queryMalloy: extractMalloyQuery(emitted.malloy, query.name),
      };
    }

    const queryDecl = buildTemporaryQuery(model, args);
    if (queryDecl.ok !== true) return jsonSafe(queryDecl) as Record<string, JsonValue>;
    const compiled = await compileSemLang(`${context.sourceText ?? ""}\n\n${queryDecl.queryText}`, {
      filePath: context.filePath,
      packageLoader: filePackageLoader(),
    });
    return {
      ok: Boolean(compiled.model) && !hasErrors(compiled.diagnostics),
      queryName: queryDecl.queryName,
      root: queryDecl.root,
      lenses: jsonSafe(queryDecl.lenses),
      diagnostics: jsonSafe(compiled.diagnostics),
      malloy: compiled.malloy ?? null,
      queryMalloy: compiled.malloy ? extractMalloyQuery(compiled.malloy, queryDecl.queryName) : null,
    };
  }

  function buildTemporaryQuery(model: SemanticModel, args: Record<string, unknown>): TemporaryQueryResult {
    const fullQuery = stringValue(args.query);
    if (fullQuery && /^query\s*:/.test(fullQuery.trim())) {
      const nameMatch = /^query\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\b/.exec(fullQuery.trim());
      const rootMatch = /^query\s*:\s*[A-Za-z_][A-Za-z0-9_]*\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(fullQuery.trim());
      return {
        ok: true,
        queryName: nameMatch?.[1] ?? "__mcp_query",
        queryText: fullQuery,
        root: rootMatch?.[1] ?? "",
        lenses: [],
      };
    }
    const namedQueryName = stringValue(args.query ?? args.name);
    const namedQuery = namedQueryName
      ? model.queries.find((candidate) => candidate.name === namedQueryName)
      : undefined;
    const body =
      queryBodyText(args.body ?? args.queryBody) ??
      (hasQueryBodyKeys(args) ? queryBodyText(args) : undefined) ??
      (namedQuery ? queryBodyToText(namedQuery.body) : undefined) ??
      (!namedQuery ? queryBodyText(args.query) : undefined);
    if (!body)
      return {
        ok: false,
        error: "Provide a named query, a full query declaration, or query body fields such as group_by and aggregate.",
      };
    const explicitRoot = stringValue(args.root ?? args.concept ?? args.source);
    const rootResult = explicitRoot
      ? { ok: true as const, root: explicitRoot }
      : inferQueryRoot(model, args, body, namedQuery);
    if (!rootResult.ok) return rootResult;
    const queryName = stringValue(args.queryName ?? args.name) ?? "__mcp_query";
    const explicitLenses = stringList(args.lenses ?? args.lens ?? args.with);
    const lenses = explicitLenses.length > 0 ? explicitLenses : (namedQuery?.lenses ?? []);
    const withClause = lenses.length > 0 ? ` with ${lenses.join(", ")}` : "";
    return {
      ok: true,
      queryName,
      queryText: `query: ${queryName} is ${rootResult.root}${withClause} -> {\n${indentBody(body)}\n}`,
      root: rootResult.root,
      lenses,
    };
  }

  function reasoningDerive(args: Record<string, unknown> = {}): Promise<Record<string, JsonValue>> {
    const model = requireModel();
    const question = stringValue(args.question ?? args.goal ?? args.text) ?? "";
    const search = searchModel(model, question, 8);
    const lenses = scoreLenses(model, question, 5);
    const concepts = search.concepts.map((item) => item.name);
    const pathHints = concepts
      .slice(0, 3)
      .flatMap((from, index, all) =>
        all.slice(index + 1).flatMap((to) => findConceptPaths(model, from, to, 3).slice(0, 2)),
      );
    return resolved({
      ok: true,
      question,
      candidateConcepts: jsonSafe(search.concepts),
      candidateMetrics: jsonSafe(search.metrics),
      candidateLenses: jsonSafe(lenses),
      pathHints: jsonSafe(pathHints),
      derivation: jsonSafe([
        "Search ontology names, descriptions, expressions, and comments for matching terms.",
        "Prefer roots that own matching measures or dimensions.",
        "Apply suggested lenses only when their descriptions or refinements match the question scope.",
        "Use find_paths output to join related concepts through declared joins and role targets.",
      ]),
    });
  }

  const specs: ToolSpec[] = [
    {
      name: "set_ontology_source",
      description: "Compile and store a SemLang ontology from path/paths or inline source/sources.",
      handler: compileSource,
    },
    {
      name: "semantic.search_terms",
      description: "Search concepts, fields, metrics, queries, and lenses by semantic terms.",
      handler: semanticSearchTerms,
    },
    {
      name: "catalog.resolve_entity",
      description: "Resolve a name to matching concepts, roles, members, lenses, sources, types, or queries.",
      handler: resolveEntity,
    },
    {
      name: "ontology.describe_concept",
      description: "Describe a concept and its members, optionally after applying lenses.",
      handler: describeConcept,
    },
    {
      name: "ontology.describe_action",
      description: "Describe an action, resolving by concept or unique action name.",
      handler: describeAction,
    },
    {
      name: "ontology.describe_role",
      description: "Describe one role by name and optional concept.",
      handler: describeRole,
    },
    {
      name: "ontology.describe_roles",
      description: "List roles across the ontology or on one concept.",
      handler: describeRoles,
    },
    {
      name: "ontology.explain_metric",
      description: "Explain measures/metrics, expressions, and expression dependencies.",
      handler: explainMetric,
    },
    {
      name: "ontology.describe_temporal_axes",
      description: "List temporal axes on one concept or the whole ontology.",
      handler: describeTemporalAxes,
    },
    {
      name: "ontology.find_paths",
      description: "Find join paths between concepts or role targets.",
      handler: findPaths,
    },
    {
      name: "lens.suggest",
      description: "Suggest lenses for a phrase, question, or user context.",
      handler: suggestLens,
    },
    {
      name: "lens.describe",
      description: "Describe a lens, its parents, types, and refinements.",
      handler: describeLens,
    },
    {
      name: "lens.expand",
      description: "Apply lenses to the model and summarize the expanded context.",
      handler: expandLens,
    },
    {
      name: "lens.required_fields",
      description: "Extract fields referenced by lens filters, definitions, joins, and validations.",
      handler: requiredFields,
    },
    {
      name: "lens.plan",
      description: "Plan lens application for a question or requested lens list.",
      handler: lensPlan,
    },
    {
      name: "query.run",
      description: "Validate a query and execute it with Malloy SDK connections unless dry_run_only is true.",
      handler: runQuery,
    },
    {
      name: "action.invoke",
      description:
        "Invoke a supported action by generating and executing SQL through the configured Malloy connection.",
      handler: invokeAction,
    },
    {
      name: "reasoning.derive",
      description: "Derive candidate concepts, metrics, lenses, and path hints for a question.",
      handler: reasoningDerive,
    },
  ];

  const tools = Object.fromEntries(
    specs.flatMap((spec) => {
      const alias = spec.name.replaceAll(".", "_");
      return alias === spec.name
        ? [[spec.name, spec.handler]]
        : [
            [spec.name, spec.handler],
            [alias, spec.handler],
          ];
    }),
  );
  const toolDescriptions = Object.fromEntries(
    specs.flatMap((spec) => {
      const alias = spec.name.replaceAll(".", "_");
      return alias === spec.name
        ? [[spec.name, spec.description]]
        : [
            [spec.name, spec.description],
            [alias, `${spec.description} Alias for ${spec.name}.`],
          ];
    }),
  );

  return {
    tools,
    toolDescriptions,
    getContext() {
      return { ...context };
    },
  };
}

export function createSemLangMcpServer(api: SemLangMcpApi = createSemLangMcp()): McpServer {
  const server = new McpServer({ name: "semlang-mcp", version: "0.1.0" });
  const inputSchema = z.object({}).passthrough();
  for (const [name, handler] of Object.entries(api.tools)) {
    server.registerTool(
      name,
      {
        description: api.toolDescriptions[name],
        inputSchema,
      },
      async (args) => {
        const structuredContent = await handler(args as Record<string, unknown>);
        return {
          content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
          structuredContent,
        };
      },
    );
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

export function resolveSemLangMcpSettings(settings: Partial<SemLangMcpSettings> = {}): SemLangMcpSettings {
  const projectDir = resolveOptionalPath(settings.projectDir ?? envSetting("PROJECT_DIR")) ?? process.cwd();
  const malloyConfigPath = resolveOptionalPath(settings.malloyConfigPath ?? envSetting("MALLOY_CONFIG_PATH"));
  return {
    projectDir,
    malloyConfigPath,
    exportDirectory: resolveOptionalPath(settings.exportDirectory ?? envSetting("EXPORT_DIRECTORY")) ?? os.tmpdir(),
  };
}

interface SqlBuildContext {
  model: SemanticModel;
  root: ResolvedConcept;
  joins: Map<string, string>;
  joinClauses: string[];
  writeContext?: boolean;
}

async function executeQuery(
  context: SemLangMcpContext,
  args: Record<string, unknown>,
  validation: Record<string, JsonValue>,
  queryLimitSeconds: number,
  transactionId: string,
): Promise<Record<string, unknown>> {
  if (validation.ok !== true) return { transactionId, ok: false, skipped: true, reason: "Query validation failed." };
  const malloy = stringValue(validation.malloy);
  const queryName = executionQueryName(args, validation);
  if (!malloy || !queryName)
    return {
      transactionId,
      ok: false,
      skipped: true,
      reason: "No generated Malloy query was available to execute.",
    };
  const projectDir =
    context.projectDir ??
    inferProjectDir(context.sourcePaths ?? [], context.model?.files ?? [], context.malloyConfigPath);
  const execution = await executeMalloyQuery({
    malloy,
    queryName,
    queryLimitSeconds,
    rowLimit: numberValue(args.rowLimit ?? args.row_limit ?? args.maxRows ?? args.max_rows),
    context: {
      projectDir,
      malloyConfigPath: context.malloyConfigPath,
      malloyConfigSource: context.malloyConfigSource,
      modelFilePath: executionModelFilePath(context),
    },
  });
  return { transactionId, ...execution };
}

async function compactExecutionOutput(
  context: SemLangMcpContext,
  args: Record<string, unknown>,
  execution: Record<string, unknown>,
  transactionId: string,
): Promise<Record<string, unknown>> {
  const compact = compactExecutionMetadata(execution);
  const rows = execution.rows;
  if (rows === undefined) return compact;
  const rowsLineCount = prettyJsonLineCount(rows);
  if (rowsLineCount <= 10) return compact;
  const exportDirectory =
    resolveOptionalPath(stringValue(args.export_directory ?? args.exportDirectory)) ?? context.settings.exportDirectory;
  await fs.mkdir(exportDirectory, { recursive: true });
  const outputPath = path.join(exportDirectory, `${transactionId}.json`);
  const exportOutput = `${JSON.stringify(
    {
      transactionId,
      queryName: execution.queryName ?? null,
      totalRows: execution.totalRows ?? null,
      rows,
    },
    null,
    2,
  )}\n`;
  await fs.writeFile(outputPath, exportOutput);
  logTransaction("info", transactionId, "query.run rows exported", { outputPath, tool: "query.run" });
  const exportedCompact = { ...compact };
  delete exportedCompact.rows;
  return {
    ...exportedCompact,
    output: {
      exported: true,
      path: outputPath,
      lineCount: rowsLineCount,
    },
  };
}

function compactExecutionMetadata(execution: Record<string, unknown>): Record<string, unknown> {
  const compact = { ...execution };
  delete compact.sql;
  delete compact.query_limit_seconds;
  delete compact.engine;
  delete compact.queryName;
  delete compact.timed_out;
  return compact;
}

/**
 * Looks up a managed SemLang setting by suffix, supporting conventional
 * uppercase `SEMLANG_*` env vars and lowercase `semlang_*` variants.
 */
function envSetting(name: string): string | undefined {
  return process.env[`SEMLANG_${name}`] ?? process.env[`semlang_${name.toLowerCase()}`];
}

function executionQueryName(args: Record<string, unknown>, validation: Record<string, JsonValue>): string | undefined {
  const query = validation.query;
  return (
    stringValue(validation.queryName) ??
    (isRecord(query) ? stringValue(query.name) : undefined) ??
    stringValue(args.queryName ?? args.query_name) ??
    stringValue(args.name)
  );
}

function executionModelFilePath(context: SemLangMcpContext): string | undefined {
  if (
    context.filePath &&
    !context.filePath.includes("__semlang_mcp_inline__") &&
    !context.filePath.includes("__semlang_mcp_context__")
  ) {
    return context.filePath;
  }
  return context.sourcePaths?.[0] ?? context.model?.files[0];
}

function publicQueryResult(validation: Record<string, JsonValue>): Record<string, JsonValue> {
  const result = { ...validation };
  delete result.malloy;
  return result;
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
      error:
        "No Malloy execution context is available. Call set_ontology_source first and ensure a Malloy config is provided or discoverable.",
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

type ActionResolution =
  | { ok: true; concept: ResolvedConcept; action: ActionDecl }
  | { ok: false; error: string; candidates?: Array<Record<string, unknown>>; context?: unknown };
type ActionTargetAssignment = { column: string; expression: string };

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

function buildActionSql(
  model: SemanticModel,
  concept: ResolvedConcept,
  action: ActionDecl,
  args: Record<string, unknown>,
):
  | {
      ok: true;
      sql: string;
      diagnostics: string[];
      verificationQuery?: string;
      rowsQuery?: string;
      operation: "update" | "insert" | "delete";
      connectionName: string;
    }
  | { ok: false; diagnostics: string[] } {
  const diagnostics: string[] = [];
  if (concept.source.kind !== "table") {
    return {
      ok: false,
      diagnostics: [`Action ${action.name} cannot run because ${concept.name} is not backed by a table source.`],
    };
  }
  const mode = action.subject?.mode;
  if (mode !== "single" && mode !== "new" && mode !== "collection") {
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

  if (mode === "single" || mode === "collection") {
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
      diagnostics.push("where must contain a non-empty predicate for action.invoke.");
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
  const sourceAlias = sqlAliasFor(ctx, sourcePrefix);
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
  if (conditions.length === 0 && join.kind !== "join_cross") {
    diagnostics.push(`Join ${join.name} has no SQL join condition.`);
  }
  const joinKeyword = join.kind === "join_cross" && conditions.length === 0 ? "CROSS JOIN" : "LEFT JOIN";
  const onClause = conditions.length > 0 ? ` ON ${conditions.join(" AND ")}` : "";
  ctx.joinClauses.push(`${joinKeyword} ${quoteTablePath(target.source.path)} AS ${alias}${onClause}`);
  void sourceAlias;
  return { concept: target, alias, prefix };
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

type ResolvedMalloyExecutionContext =
  | { ok: true; projectDir: string; malloyConfigPath: string; source: "explicit" | "discovered" }
  | { ok: false; error: string };

async function resolveMalloyExecutionContext(
  explicitProjectDir: string | undefined,
  malloyConfigPath: string | undefined,
  sourcePaths: string[],
  modelFiles: string[] = [],
): Promise<ResolvedMalloyExecutionContext> {
  if (malloyConfigPath) {
    const resolvedConfigPath = path.resolve(malloyConfigPath);
    return {
      ok: true,
      projectDir: explicitProjectDir ? path.resolve(explicitProjectDir) : path.dirname(resolvedConfigPath),
      malloyConfigPath: resolvedConfigPath,
      source: "explicit",
    };
  }

  const startDir = inferConfigSearchStartDir(sourcePaths, modelFiles);
  const ceilingDir = explicitProjectDir ? path.resolve(explicitProjectDir) : path.parse(startDir).root;
  const discovered = await discoverMalloyConfigPath(startDir, ceilingDir);
  if (discovered) {
    return {
      ok: true,
      projectDir: explicitProjectDir ? path.resolve(explicitProjectDir) : path.dirname(discovered),
      malloyConfigPath: discovered,
      source: "discovered",
    };
  }

  return {
    ok: false,
    error: [
      "No Malloy config file was found for set_ontology_source.",
      "Pass configPath or malloyConfigPath explicitly, or add malloy-config-local.json or malloy-config.json at or above the SemLang model directory.",
      `Searched from ${startDir} up to ${ceilingDir}.`,
    ].join(" "),
  };
}

function inferProjectDir(sourcePaths: string[] = [], modelFiles: string[] = [], malloyConfigPath?: string): string {
  const candidates = [...sourcePaths, ...modelFiles]
    .filter((item) => item && !item.includes("__semlang_mcp_inline__") && !item.includes("__semlang_mcp_context__"))
    .map((item) => path.resolve(item));
  if (candidates.length > 0) return commonDirectory(candidates.map((item) => path.dirname(item)));
  if (malloyConfigPath) return path.dirname(path.resolve(malloyConfigPath));
  return process.cwd();
}

function inferConfigSearchStartDir(sourcePaths: string[] = [], modelFiles: string[] = []): string {
  const candidates = [...sourcePaths, ...modelFiles]
    .filter((item) => item && !item.includes("__semlang_mcp_inline__") && !item.includes("__semlang_mcp_context__"))
    .map((item) => path.resolve(item));
  if (candidates.length > 0) return commonDirectory(candidates.map((item) => path.dirname(item)));
  return process.cwd();
}

function projectDirDiscoveryCeiling(
  sourcePaths: string[] = [],
  modelFiles: string[] = [],
  requestedProjectDir: string | undefined,
  managedProjectDir: string,
): string | undefined {
  if (requestedProjectDir) return requestedProjectDir;
  const startDir = inferConfigSearchStartDir(sourcePaths, modelFiles);
  const resolvedManagedProjectDir = path.resolve(managedProjectDir);
  return pathWithinOrEqual(startDir, resolvedManagedProjectDir) ? resolvedManagedProjectDir : undefined;
}

function pathWithinOrEqual(child: string, ancestor: string): boolean {
  const relative = path.relative(path.resolve(ancestor), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function commonDirectory(dirs: string[]): string {
  if (dirs.length === 0) return process.cwd();
  const [first, ...rest] = dirs.map((dir) => path.resolve(dir).split(path.sep).filter(Boolean));
  if (!first) return process.cwd();
  const common = [...first];
  for (const dir of rest) {
    let index = 0;
    while (index < common.length && common[index] === dir[index]) index += 1;
    common.length = index;
  }
  const root = path.parse(path.resolve(dirs[0]!)).root;
  return path.join(root, ...common);
}

function describeConceptPlain(model: SemanticModel, concept: ResolvedConcept) {
  return {
    name: concept.name,
    description: concept.description ?? null,
    stereotype: concept.stereotype,
    phaseParent: concept.phaseParent ?? null,
    sourceName: concept.sourceName,
    source: sourceDescription(model, concept.source),
    identities: concept.identities,
    fields: concept.fields,
    joins: concept.joins,
    roles: concept.roles,
    dimensions: concept.dimensions,
    measures: concept.measures,
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
  const lower = name.toLowerCase();
  const matches: Array<Record<string, unknown>> = [];
  const include = (candidate: string) =>
    !name || candidate.toLowerCase() === lower || candidate.toLowerCase().includes(lower);
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
  for (const query of model.queries) if (include(query.name)) matches.push({ kind: "query", name: query.name, query });
  return matches;
}

async function resolveBusinessEntity(
  model: SemanticModel,
  filePath: string | undefined,
  conceptName: string | undefined,
  businessName: string | undefined,
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
          unique: "unique" in field ? field.unique : true,
        })),
        candidateFields: candidateFields.map((field) => ({
          name: field.name,
          kind: "expression" in field ? "dimension" : "field",
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

function searchModel(model: SemanticModel, text: string, limit: number) {
  const tokens = tokenize(text);
  const concepts = scored(
    [...model.concepts.values()].map((concept) => ({
      name: concept.name,
      description: concept.description ?? null,
      stereotype: concept.stereotype,
      text: [
        concept.name,
        concept.description ?? "",
        concept.stereotype,
        concept.source.expression,
        concept.where.map((item) => item.expression).join(" "),
        memberSearchItems(concept)
          .map((item) => `${item.name} ${item.text}`)
          .join(" "),
      ].join(" "),
    })),
    tokens,
    limit,
  );
  const metrics = scored(
    [...model.concepts.values()].flatMap((concept) =>
      concept.measures.map((measure) => ({
        concept: concept.name,
        name: measure.name,
        expression: measure.expression,
        text: `${concept.name} ${measure.name} ${measure.expression}`,
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
  return { concepts, metrics, members, queries, lenses, ignored };
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

function scored<T extends { text: string }>(
  items: T[],
  tokens: string[],
  limit: number,
): Array<Omit<T, "text"> & { score: number; matchedTerms: string[] }> {
  return items
    .map((item) => {
      const haystack = item.text.toLowerCase();
      const matchedTerms = tokens.filter((token) => haystack.includes(token));
      const name = "name" in item && typeof item.name === "string" ? item.name.toLowerCase() : "";
      const score = matchedTerms.reduce((sum, token) => sum + (name.includes(token) ? 3 : 1), 0);
      const { text: _text, ...rest } = item;
      return { ...rest, score, matchedTerms };
    })
    .filter((item) => item.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function memberSearchItems(concept: ResolvedConcept) {
  return [
    ...concept.identities.map((value) => ({ kind: "identity", name: value.name, text: value.typeName, value })),
    ...concept.fields.map((value) => ({ kind: "field", name: value.name, text: value.typeName, value })),
    ...concept.joins.map((value) => ({
      kind: "join",
      name: value.name,
      text: `${value.target} ${value.on} ${value.at ?? ""}`,
      value,
    })),
    ...concept.roles.map((value) => ({
      kind: "role",
      name: value.name,
      text: `${qualifiedRoleName(concept.name, value.name)} ${value.label ?? ""} ${value.aliases.join(" ")} ${value.predicate}`,
      value: {
        ...value,
        qualifiedName: qualifiedRoleName(concept.name, value.name),
        label: value.label ?? null,
        aliases: value.aliases,
      },
    })),
    ...concept.dimensions.map((value) => ({ kind: "dimension", name: value.name, text: value.expression, value })),
    ...concept.measures.map((value) => ({ kind: "measure", name: value.name, text: value.expression, value })),
    ...concept.validations.map((value) => ({
      kind: "validation",
      name: value.name,
      text: `${value.description ?? ""} ${value.predicate ?? ""}`,
      value,
    })),
    ...concept.temporal.map((value) => ({ kind: "temporal_axis", name: value.axis, text: value.expression, value })),
    ...concept.views.map((value) => ({ kind: "view", name: value.name, text: queryBodySearchText(value.body), value })),
    ...concept.actions.map((value) => ({ kind: "action", name: value.name, text: actionSearchText(value), value })),
  ];
}

function conceptMembersSearchText(members: ResolvedConcept | LensDecl["refinements"][number]["members"]) {
  return [
    members.identities.map((item) => `${item.name} ${item.typeName}`).join(" "),
    members.fields.map((item) => `${item.name} ${item.typeName}`).join(" "),
    members.joins.map((item) => `${item.name} ${item.target} ${item.on} ${item.at ?? ""}`).join(" "),
    members.roles
      .map(
        (item) =>
          `${item.name} ${"sourceName" in members ? qualifiedRoleName(members.name, item.name) : ""} ${item.label ?? ""} ${item.aliases.join(" ")} ${item.predicate}`,
      )
      .join(" "),
    members.dimensions.map((item) => `${item.name} ${item.expression}`).join(" "),
    members.measures.map((item) => `${item.name} ${item.expression}`).join(" "),
    members.validations.map((item) => `${item.name} ${item.description ?? ""} ${item.predicate ?? ""}`).join(" "),
    members.temporal.map((item) => `${item.axis} ${item.expression}`).join(" "),
    members.where.map((item) => item.expression).join(" "),
    members.views.map((item) => `${item.name} ${queryBodySearchText(item.body)}`).join(" "),
    members.actions.map(actionSearchText).join(" "),
  ].join(" ");
}

function actionSearchText(action: ActionDecl): string {
  return [
    action.name,
    action.description ?? "",
    action.subject?.mode ?? "",
    action.params.map((param) => `${param.name} ${param.typeName} ${param.defaultExpression ?? ""}`).join(" "),
    action.guards.map((guard) => `${guard.predicate} ${guard.elseMessage ?? ""}`).join(" "),
    action.edits
      .map((edit) =>
        edit.kind === "set"
          ? `${edit.target} ${edit.expression}`
          : edit.kind === "insert"
            ? edit.assignments.map((assignment) => `${assignment.target} ${assignment.expression}`).join(" ")
            : "delete",
      )
      .join(" "),
    action.logBlocks.flatMap((block) => block.lines).join(" "),
    action.effectBlocks.flatMap((block) => block.lines).join(" "),
    action.agentMetadata.map((entry) => `${entry.key} ${entry.value}`).join(" "),
  ].join(" ");
}

function queryBodySearchText(body: QueryBodyDecl): string {
  return [
    body.where?.expression ?? "",
    body.select.map(queryItemText).join(" "),
    body.groupBy.map(queryItemText).join(" "),
    body.aggregate.map(queryItemText).join(" "),
    body.calculate.map(queryItemText).join(" "),
    body.orderBy.map(queryItemText).join(" "),
  ].join(" ");
}

function queryItemText(item: { expression: string; alias?: string }) {
  return `${item.alias ?? ""} ${item.expression}`;
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

function hasQueryBodyKeys(value: Record<string, unknown>): boolean {
  return ["where", "select", "groupBy", "group_by", "aggregate", "calculate", "orderBy", "order_by", "limit"].some(
    (key) => value[key] !== undefined,
  );
}

function queryBodyText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  const lines: string[] = [];
  const appendItems = (keys: string[], header: string) => {
    const items = keys.flatMap((key) => stringList(value[key]));
    if (items.length > 0) lines.push(`${header}:`, ...items.map((item) => `  ${item}`));
  };
  const where = stringValue(value.where);
  if (where) lines.push("where:", `  ${where}`);
  appendItems(["select"], "select");
  appendItems(["groupBy", "group_by"], "group_by");
  appendItems(["aggregate"], "aggregate");
  appendItems(["calculate"], "calculate");
  appendItems(["orderBy", "order_by"], "order_by");
  const limit = numberValue(value.limit);
  if (limit !== undefined) lines.push(`limit: ${limit}`);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

function queryBodyToText(body: QueryBodyDecl): string {
  return [
    body.where ? ["where:", `  ${body.where.expression}`] : [],
    body.select.length > 0 ? ["select:", ...body.select.map((item) => `  ${formatQueryItem(item)}`)] : [],
    body.groupBy.length > 0 ? ["group_by:", ...body.groupBy.map((item) => `  ${formatQueryItem(item)}`)] : [],
    body.aggregate.length > 0 ? ["aggregate:", ...body.aggregate.map((item) => `  ${formatQueryItem(item)}`)] : [],
    body.calculate.length > 0 ? ["calculate:", ...body.calculate.map((item) => `  ${formatQueryItem(item)}`)] : [],
    body.orderBy.length > 0 ? ["order_by:", ...body.orderBy.map((item) => `  ${formatQueryItem(item)}`)] : [],
    body.limit ? [`limit: ${body.limit.value}`] : [],
  ]
    .flat()
    .join("\n");
}

function formatQueryItem(item: { expression: string; alias?: string }) {
  return item.alias ? `${item.alias} is ${item.expression}` : item.expression;
}

function inferQueryRoot(
  model: SemanticModel,
  args: Record<string, unknown>,
  body: string,
  namedQuery?: QueryDecl,
): { ok: true; root: string } | TemporaryQueryResult {
  if (namedQuery) return { ok: true, root: namedQuery.root };
  const bodyCandidates = scoreRootCandidates(model, body);
  if (bodyCandidates.length > 0 && bodyCandidates[0]!.score > 0) {
    const best = bodyCandidates[0]!;
    const tied = bodyCandidates.filter((candidate) => candidate.score === best.score);
    if (tied.length === 1) return { ok: true, root: best.root };
    return {
      ok: false,
      error: "Unable to infer an unambiguous query root from the provided fields. Provide root or concept.",
      candidates: jsonSafe(tied.slice(0, 8)),
    };
  }
  const text = stringValue(
    args.question ?? args.goal ?? args.phrase ?? args.text ?? args.business_name ?? args.businessName,
  );
  if (text) {
    const semantic = searchModel(model, text, 8).concepts;
    if (semantic.length === 1 || (semantic[0] && semantic[0].score > (semantic[1]?.score ?? -1)))
      return { ok: true, root: semantic[0]!.name };
    return {
      ok: false,
      error: "Unable to infer an unambiguous query root from semantic text. Provide root or concept.",
      candidates: jsonSafe(semantic),
    };
  }
  return {
    ok: false,
    error: "No root/concept was provided and no unambiguous root could be inferred.",
    candidates: jsonSafe([...model.concepts.keys()].slice(0, 20)),
    note: "Pass root or concept, or provide query fields that clearly belong to one concept.",
  };
}

function scoreRootCandidates(model: SemanticModel, body: string) {
  const references = [
    ...new Set(expressionIdentifiers(body).filter((identifier) => !ignoredExpressionIdentifier(identifier))),
  ];
  return [...model.concepts.values()]
    .map((concept) => {
      const matched = references.filter((reference) => resolveMemberPath(model, concept, reference));
      return { root: concept.name, score: matched.length, matchedReferences: matched };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.root.localeCompare(b.root));
}

function resolveMemberPath(model: SemanticModel, root: ResolvedConcept, pathText: string): boolean {
  const segments = pathText.split(".");
  let current: ResolvedConcept | undefined = root;
  for (let i = 0; i < segments.length; i += 1) {
    if (!current) return false;
    const segment = segments[i]!;
    if (i > 0 && scalarPathProperties.has(segment)) return true;
    const join: JoinDecl | undefined = current.joins.find((candidate) => candidate.name === segment);
    if (join) {
      current = model.concepts.get(join.target) ?? roleTarget(model, join.target);
      continue;
    }
    if (!conceptHasMember(current, segment)) return false;
    if (i < segments.length - 1 && !scalarPathProperties.has(segments[i + 1]!)) return false;
  }
  return true;
}

function conceptHasMember(concept: ResolvedConcept, name: string): boolean {
  return (
    concept.identities.some((item) => item.name === name) ||
    concept.fields.some((item) => item.name === name) ||
    concept.dimensions.some((item) => item.name === name) ||
    concept.measures.some((item) => item.name === name) ||
    concept.roles.some((item) => item.name === name)
  );
}

const ignoredExpressionIdentifiers = new Set([
  "sum",
  "avg",
  "count",
  "max",
  "min",
  "median",
  "concat",
  "nullif",
  "now",
  "period",
  "currency",
  "rank",
  "row_number",
  "dense_rank",
  "percent_rank",
]);
const scalarPathProperties = new Set(["date", "month", "week", "quarter", "year", "day"]);

function ignoredExpressionIdentifier(identifier: string): boolean {
  return ignoredExpressionIdentifiers.has(identifier.toLowerCase());
}

function indentBody(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join("\n");
}

function extractMalloyQuery(malloy: string, queryName: string): string | null {
  const start = malloy.indexOf(`query: ${queryName} `);
  if (start < 0) return null;
  const next = malloy.indexOf("\n\n", start);
  return malloy.slice(start, next < 0 ? undefined : next).trim();
}

function expressionIdentifiers(expression: string): string[] {
  const stripped = expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, " ");
  const keywords = new Set([
    "and",
    "or",
    "not",
    "is",
    "null",
    "in",
    "case",
    "when",
    "then",
    "else",
    "end",
    "distinct",
    "true",
    "false",
    "this",
  ]);
  return [
    ...new Set(
      (stripped.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g) ?? []).filter(
        (item) => !keywords.has(item.toLowerCase()) && !/^[A-Z]/.test(item),
      ),
    ),
  ];
}

function fieldMatches(requestedLower: string, candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return lower === requestedLower || lower.endsWith(`.${requestedLower}`) || lower.split(".").at(-1) === requestedLower;
}

function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_]+/g) ?? [])].filter((token) => token.length > 1);
}

function queryLimitSecondsValue(args: Record<string, unknown>): QueryLimitSecondsResult {
  const raw =
    args.query_limit_seconds ??
    args.queryLimitSeconds ??
    args.query_time_limit_seconds ??
    args.queryTimeLimitSeconds ??
    args.query_time_limit ??
    args.queryTimeLimit;
  if (raw === undefined) {
    return {
      ok: false,
      error: "query.run requires query_limit_seconds as a positive integer number of seconds.",
    };
  }
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    return {
      ok: false,
      error: "query_limit_seconds must be a positive integer number of seconds.",
    };
  }
  return { ok: true, value: raw };
}

function actionQueryLimitSecondsValue(args: Record<string, unknown>): QueryLimitSecondsResult {
  const raw =
    args.query_limit_seconds ??
    args.queryLimitSeconds ??
    args.query_time_limit_seconds ??
    args.queryTimeLimitSeconds ??
    args.query_time_limit ??
    args.queryTimeLimit;
  if (raw === undefined) return { ok: true, value: defaultActionQueryLimitSeconds };
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    return {
      ok: false,
      error: "action.invoke query_limit_seconds must be a positive integer number of seconds.",
    };
  }
  return { ok: true, value: raw };
}

function notFound(kind: string, name: unknown, model: SemanticModel): Record<string, JsonValue> {
  return {
    ok: false,
    error: `No ${kind} found for ${typeof name === "string" ? name : JSON.stringify(name)}.`,
    context: jsonSafe(modelSummary(model)),
  };
}
