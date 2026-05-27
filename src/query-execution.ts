/*
 * Purpose: Encapsulates one MCP run_query request from validation through Malloy execution and response shaping.
 * Encapsulation: Keep query execution orchestration here; command and MCP tool registration stays in src/semlang-runtime.ts.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { emitMalloyQuery } from "./emitter.js";
import { expressionIdentifiers } from "./expression-utils.js";
import { executeMalloyQuery } from "./malloy-execution.js";
import { logTransaction } from "./logging.js";
import { inferProjectDir, isSyntheticMcpPath } from "./mcp-settings.js";
import { conceptSearchItems, scored, tokenize } from "./model-search.js";
import {
  booleanValue,
  hasErrors,
  isRecord,
  jsonSafe,
  numberValue,
  prettyJsonLineCount,
  resolveOptionalPath,
  stringList,
  stringValue,
  type JsonValue,
} from "./mcp-utils.js";
import { parseSemLangQuery } from "./parser.js";
import { applyQueryLenses, validateQueryAgainstModel } from "./resolver.js";
import type { SemLangMcpContext } from "./semlang-runtime.js";
import type { Diagnostic, JoinDecl, QueryBodyDecl, QueryDecl, ResolvedConcept, SemanticModel } from "./types.js";

type QueryLimitSecondsResult = { ok: true; value: number } | { ok: false; error: string };
type TemporaryQueryResult =
  | { ok: true; queryName: string; queryText: string; root: string; lenses: string[] }
  | { ok: false; error: string; candidates?: JsonValue; note?: string };
type BuiltTemporaryQuery = Extract<TemporaryQueryResult, { ok: true }>;

const namedQueryOverrideKeys = ["body", "queryBody", "root", "concept", "source", "lens", "lenses", "with"] as const;
const maxQueryLimitSeconds = Math.floor(2_147_483_647 / 1000);

export class QueryExecution {
  constructor(
    private readonly context: SemLangMcpContext,
    private readonly model: SemanticModel,
    private readonly args: Record<string, unknown>,
    private readonly transactionId: string,
  ) {}

  async execute(): Promise<Record<string, JsonValue>> {
    const validation = this.validateOrBuildQuery();
    if (booleanValue(this.args.dry_run_only ?? this.args.dryRunOnly)) {
      logTransaction(
        "debug",
        this.transactionId,
        "run_query skipped for dry_run_only",
        { tool: "run_query" },
        this.context.settings,
      );
      return {
        ...this.publicQueryResult(validation),
        execution: {
          transactionId: this.transactionId,
          skipped: true,
          reason: "dry_run_only requested; query was validated but not executed.",
        },
      };
    }

    const queryLimitSeconds = this.queryLimitSecondsValue();
    if (!queryLimitSeconds.ok) {
      logTransaction(
        "info",
        this.transactionId,
        "run_query rejected before execution",
        { tool: "run_query" },
        this.context.settings,
      );
      return {
        ...queryLimitSeconds,
        execution: {
          transactionId: this.transactionId,
          skipped: true,
          reason: "query_limit_seconds validation failed.",
        },
      };
    }

    const execution = await this.executeQuery(validation, queryLimitSeconds.value);
    const compactExecution = await this.compactExecutionOutput(execution);
    logTransaction("info", this.transactionId, "run_query completed", { tool: "run_query" }, this.context.settings);
    return { ...this.publicQueryResult(validation), execution: jsonSafe(compactExecution) };
  }

  private validateOrBuildQuery(): Record<string, JsonValue> {
    const query = this.namedQuery();
    if (this.isNamedQueryValidationRequest(query)) return this.validateNamedQuery(query);
    const queryDecl = this.buildTemporaryQuery();
    if (queryDecl.ok !== true) return jsonSafe(queryDecl) as Record<string, JsonValue>;
    return this.validateTemporaryQuery(queryDecl);
  }

  private validateNamedQuery(query: QueryDecl): Record<string, JsonValue> {
    const diagnostics: Diagnostic[] = [];
    const queryModel = query.lenses.length > 0 ? applyQueryLenses(this.model, query, diagnostics) : this.model;
    const malloy = queryModel ? (this.context.malloy ?? "") : "";
    return {
      ok: Boolean(queryModel) && !hasErrors(diagnostics),
      query: jsonSafe(query),
      diagnostics: jsonSafe(diagnostics),
      malloy,
      queryMalloy: extractMalloyQuery(malloy, query.name),
    };
  }

  private validateTemporaryQuery(queryDecl: BuiltTemporaryQuery): Record<string, JsonValue> {
    const parsed = parseSemLangQuery(queryDecl.queryText, { filePath: this.context.filePath });
    const duplicateDiagnostics = this.duplicateQueryDiagnostics(parsed.query);
    const validationDiagnostics = parsed.query ? validateQueryAgainstModel(this.model, parsed.query) : [];
    const emitted = parsed.query ? emitMalloyQuery(this.model, parsed.query) : { malloy: "", diagnostics: [] };
    const diagnostics = [
      ...parsed.diagnostics,
      ...duplicateDiagnostics,
      ...validationDiagnostics,
      ...emitted.diagnostics,
    ];
    const ok = Boolean(parsed.query) && !hasErrors(diagnostics);
    const malloy = ok ? this.cachedMalloyWithQuery(emitted.malloy) : null;
    return {
      ok,
      queryName: parsed.query?.name ?? queryDecl.queryName,
      root: parsed.query?.root ?? queryDecl.root,
      lenses: jsonSafe(parsed.query?.lenses ?? queryDecl.lenses),
      diagnostics: jsonSafe(diagnostics),
      malloy,
      queryMalloy: malloy ? extractMalloyQuery(malloy, parsed.query?.name ?? queryDecl.queryName) : null,
    };
  }

  private duplicateQueryDiagnostics(query: QueryDecl | undefined): Diagnostic[] {
    if (!query || !this.model.queries.some((candidate) => candidate.name === query.name)) return [];
    return [
      {
        severity: "error",
        code: "DUPLICATE_QUERY",
        message: `Duplicate query ${query.name}.`,
        location: query.location,
      },
    ];
  }

  private isNamedQueryValidationRequest(query: QueryDecl | undefined): query is QueryDecl {
    return (
      query !== undefined && namedQueryOverrideKeys.every((key) => !this.args[key]) && !hasQueryBodyKeys(this.args)
    );
  }

  private buildTemporaryQuery(): TemporaryQueryResult {
    const fullQuery = fullQueryDeclaration(this.args);
    if (fullQuery) return fullQuery;

    const namedQuery = this.namedQuery();
    const body = temporaryQueryBody(this.args, namedQuery);
    if (!body)
      return {
        ok: false,
        error: "Provide a named query, a full query declaration, or query body fields such as group_by and aggregate.",
      };
    const explicitRoot = stringValue(this.args.root ?? this.args.concept ?? this.args.source);
    const rootResult = explicitRoot ? { ok: true as const, root: explicitRoot } : this.inferQueryRoot(body, namedQuery);
    if (!rootResult.ok) return rootResult;
    const queryName = stringValue(this.args.queryName ?? this.args.name) ?? "__mcp_query";
    const explicitLenses = stringList(this.args.lenses ?? this.args.lens ?? this.args.with);
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

  private namedQuery(): QueryDecl | undefined {
    const namedQueryName = stringValue(this.args.query ?? this.args.name);
    return namedQueryName ? this.model.queries.find((candidate) => candidate.name === namedQueryName) : undefined;
  }

  private inferQueryRoot(body: string, namedQuery?: QueryDecl): { ok: true; root: string } | TemporaryQueryResult {
    if (namedQuery) return { ok: true, root: namedQuery.root };
    const bodyCandidates = scoreRootCandidates(this.model, body);
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
      this.args.question ??
        this.args.goal ??
        this.args.phrase ??
        this.args.text ??
        this.args.business_name ??
        this.args.businessName,
    );
    if (text) {
      const semantic = scoreSemanticRootCandidates(this.model, text, 8);
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
      candidates: jsonSafe([...this.model.concepts.keys()].slice(0, 20)),
      note: "Pass root or concept, or provide query fields that clearly belong to one concept.",
    };
  }

  private async executeQuery(
    validation: Record<string, JsonValue>,
    queryLimitSeconds: number,
  ): Promise<Record<string, unknown>> {
    if (validation.ok !== true)
      return { transactionId: this.transactionId, ok: false, skipped: true, reason: "Query validation failed." };
    const malloy = stringValue(validation.malloy);
    const queryName = this.executionQueryName(validation);
    if (!malloy || !queryName)
      return {
        transactionId: this.transactionId,
        ok: false,
        skipped: true,
        reason: "No generated Malloy query was available to execute.",
      };
    if (!this.context.malloyConfigPath) {
      return {
        transactionId: this.transactionId,
        ok: false,
        error: missingMalloyConfigMessage(),
      };
    }
    const projectDir =
      this.context.projectDir ??
      inferProjectDir(this.context.sourcePaths ?? [], this.context.model?.files ?? [], this.context.malloyConfigPath);
    const execution = await executeMalloyQuery({
      malloy,
      queryName,
      queryLimitSeconds,
      rowLimit: numberValue(this.args.rowLimit ?? this.args.row_limit ?? this.args.maxRows ?? this.args.max_rows),
      context: {
        projectDir,
        malloyConfigPath: this.context.malloyConfigPath,
        malloyConfigSource: this.context.malloyConfigSource,
        modelFilePath: this.executionModelFilePath(),
      },
    });
    return { transactionId: this.transactionId, ...execution };
  }

  private async compactExecutionOutput(execution: Record<string, unknown>): Promise<Record<string, unknown>> {
    const compact = compactExecutionMetadata(execution);
    const rows = execution.rows;
    if (rows === undefined) return compact;
    const rowsLineCount = prettyJsonLineCount(rows);
    if (rowsLineCount <= 10) return compact;
    const exportDirectory =
      resolveOptionalPath(stringValue(this.args.export_directory ?? this.args.exportDirectory)) ??
      this.context.exportDirectory ??
      this.context.settings.exportDirectory;
    await fs.mkdir(exportDirectory, { recursive: true });
    const outputPath = path.join(exportDirectory, `${this.transactionId}.json`);
    const exportOutput = `${JSON.stringify(
      {
        transactionId: this.transactionId,
        queryName: execution.queryName ?? null,
        totalRows: execution.totalRows ?? null,
        rows,
      },
      null,
      2,
    )}\n`;
    await fs.writeFile(outputPath, exportOutput);
    logTransaction(
      "info",
      this.transactionId,
      "run_query rows exported",
      { outputPath, tool: "run_query" },
      this.context.settings,
    );
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

  private executionQueryName(validation: Record<string, JsonValue>): string | undefined {
    const query = validation.query;
    return (
      stringValue(validation.queryName) ??
      (isRecord(query) ? stringValue(query.name) : undefined) ??
      stringValue(this.args.queryName ?? this.args.query_name) ??
      stringValue(this.args.name)
    );
  }

  private cachedMalloyWithQuery(queryMalloy: string): string {
    const baseMalloy = this.context.malloy?.trimEnd();
    if (!baseMalloy) return queryMalloy;
    if (!queryMalloy) return baseMalloy;
    return `${baseMalloy}\n\n${queryMalloy}`;
  }

  private executionModelFilePath(): string | undefined {
    if (this.context.filePath && !isSyntheticMcpPath(this.context.filePath)) {
      return this.context.filePath;
    }
    return this.context.sourcePaths?.[0] ?? this.context.model?.files[0];
  }

  private publicQueryResult(validation: Record<string, JsonValue>): Record<string, JsonValue> {
    const result = { ...validation };
    delete result.malloy;
    return result;
  }

  private queryLimitSecondsValue(): QueryLimitSecondsResult {
    const raw =
      this.args.query_limit_seconds ??
      this.args.queryLimitSeconds ??
      this.args.query_time_limit_seconds ??
      this.args.queryTimeLimitSeconds ??
      this.args.query_time_limit ??
      this.args.queryTimeLimit;
    if (raw === undefined) {
      return {
        ok: false,
        error: "run_query requires query_limit_seconds as a positive integer number of seconds.",
      };
    }
    const parsed = positiveIntegerSecondsValue(raw);
    if (parsed === undefined) {
      return {
        ok: false,
        error: `query_limit_seconds must be a positive integer number of seconds no greater than ${maxQueryLimitSeconds}.`,
      };
    }
    return { ok: true, value: parsed };
  }
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

function missingMalloyConfigMessage(): string {
  return [
    "No Malloy config is configured for this SemLang project.",
    'Run "semlang setup --force" after adding malloy-config.json, or add malloy.configPath to .semlang/settings.yml.',
  ].join(" ");
}

function hasQueryBodyKeys(value: Record<string, unknown>): boolean {
  return ["where", "select", "groupBy", "group_by", "aggregate", "calculate", "orderBy", "order_by", "limit"].some(
    (key) => value[key] !== undefined,
  );
}

function fullQueryDeclaration(args: Record<string, unknown>): TemporaryQueryResult | undefined {
  const fullQuery = stringValue(args.query);
  if (!fullQuery || !/^query\s*:/.test(fullQuery.trim())) return undefined;
  const trimmed = fullQuery.trim();
  const nameMatch = /^query\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\b/.exec(trimmed);
  const rootMatch = /^query\s*:\s*[A-Za-z_][A-Za-z0-9_]*\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\b/.exec(trimmed);
  return {
    ok: true,
    queryName: nameMatch?.[1] ?? "__mcp_query",
    queryText: fullQuery,
    root: rootMatch?.[1] ?? "",
    lenses: [],
  };
}

function temporaryQueryBody(args: Record<string, unknown>, namedQuery?: QueryDecl): string | undefined {
  return (
    queryBodyText(args.body ?? args.queryBody) ??
    (hasQueryBodyKeys(args) ? queryBodyText(args) : undefined) ??
    (namedQuery ? queryBodyToText(namedQuery.body) : undefined) ??
    (!namedQuery ? queryBodyText(args.query) : undefined)
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

function roleTarget(model: SemanticModel, roleName: string): ResolvedConcept | undefined {
  for (const concept of model.concepts.values()) {
    if (concept.roles.some((role) => role.name === roleName)) return concept;
  }
  return undefined;
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

function scoreSemanticRootCandidates(model: SemanticModel, text: string, limit: number) {
  return scored(conceptSearchItems(model), tokenize(text), limit);
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

function positiveIntegerSecondsValue(raw: unknown): number | undefined {
  const parsed = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maxQueryLimitSeconds
    ? parsed
    : undefined;
}
