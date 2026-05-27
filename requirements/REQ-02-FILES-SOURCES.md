# REQ-02-FILES-SOURCES: File Shape, Includes, and Sources

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern SemLang package declarations, include loading, top-level declaration shape, and source expression handling.

## 02.01 File Shape

A SemLang file has a package-first shape and then a list of declarations that participate in one semantic model. The compiler should keep this shape strict so invalid files fail early with useful diagnostics.

- 02.01.001: Every SemLang file MUST declare exactly one package.
- 02.01.002: The package declaration MUST be the first meaningful declaration in the file.
- 02.01.003: Only comments and blank lines MAY appear before the package declaration.
- 02.01.004: A file MAY declare includes after the package declaration.
- 02.01.005: Include declarations MUST appear before semantic types, named sources, concepts, lenses, and queries.
- 02.01.006: The compiler MUST reject include declarations that appear after model declarations.
- 02.01.007: A file MAY declare semantic types, named sources, concepts, lenses, and queries after the package and include declarations.
- 02.01.008: The compiler MUST reject unexpected top-level declarations.
- 02.01.009: The compiler MUST report duplicate top-level symbols for sources, types, concepts, lenses, and queries.

## 02.02 Includes

Includes let one file load another before resolution. Include handling is part of semantic model construction, not textual macro substitution.

- 02.02.001: Include paths MUST be interpreted as relative to the including file when the including file has a file path.
- 02.02.002: Include paths MAY be interpreted relative to the current working directory when no including file path is available.
- 02.02.003: Included files MUST be parsed and resolved before the including file is merged into the semantic model.
- 02.02.004: The compiler MUST reject include cycles.
- 02.02.005: The compiler MUST report a diagnostic when includes are present but no package loader is available.
- 02.02.006: Declarations from included files MUST participate in duplicate-symbol checks with declarations from the including file.
- 02.02.007: The compiler MUST parse and merge each resolved include file at most once per compilation, so diamond include graphs do not create duplicate declarations.

## 02.03 Source Expressions

Source expressions are intentionally Malloy-shaped. The compiler preserves accepted source expressions and rejects forms that hide connection choices.

- 02.03.001: Source expressions for physical tables MUST use a named Malloy connection, such as `duckdb.table('stores')`.
- 02.03.002: Source expressions for SQL sources MUST use a named Malloy connection, such as `duckdb.sql("""select ...""")`.
- 02.03.003: The compiler MUST reject unqualified source expressions such as `table('stores')`.
- 02.03.004: SQL source text MUST be passed through as part of the source expression.
- 02.03.005: A named source MAY be backed by a table expression.
- 02.03.006: A named source MAY be backed by a SQL expression.
- 02.03.007: A named source MAY reference another source, concept, or query by simple name when that reference resolves.
- 02.03.008: A concept `from` clause MAY reference a table, SQL source, named source, concept source, or query result.
- 02.03.009: The compiler MUST report unresolved source references.

## 02.04 Source Queries

Named sources can be declared from a root source plus a query body. These sources reuse query validation but become reusable source declarations.

- 02.04.001: A named source MAY be declared from another source plus a query body using `source: name is Root -> { ... }`.
- 02.04.002: When a source-query root resolves to a concept, the compiler MUST validate the query body against that concept.
- 02.04.003: When a source-query root resolves to a named source, SQL source, table source, or prior query result rather than a concept, the compiler MUST treat the query body as Malloy-shaped pass-through unless it has enough structural schema information to validate fields precisely.
- 02.04.004: A source query rooted in a non-concept source MUST reject SemLang-only expression constructs that require concept context, such as role tests or semantic join-path validation, unless a later requirement defines structural validation for that source kind.
- 02.04.005: When a concept is backed by a query result, the compiler MUST emit the query before emitting the concept source that extends it.
- 02.04.006: Source-query bodies MUST support the same query-body clauses as concept-local views and queries where those clauses are otherwise valid.

## 02.05 MCP Malloy Execution Config

MCP query execution uses Malloy connection configuration captured when an ontology source is loaded. Connection names in SemLang source text remain model-level names, while connection engine types live in Malloy config.

- 02.05.001: `load_ontology` MUST accept an explicit Malloy config path through `configPath` or `malloyConfigPath`, and that explicit path MAY use any JSON filename.
- 02.05.002: When no explicit Malloy config path is supplied, `load_ontology` MUST discover `malloy-config-local.json` or `malloy-config.json` by walking upward from the SemLang model directory.
- 02.05.003: When no explicit Malloy config path is supplied and discovery fails, `load_ontology` MUST return a clear setup error and MUST NOT synthesize an implicit fallback connection.
- 02.05.004: `load_ontology` MUST store the resolved Malloy project directory, config path, and config source in MCP context for later query execution.
- 02.05.005: `run_query` MUST execute generated Malloy through the Malloy SDK using the config context captured by `load_ontology`.
- 02.05.006: SemLang source connection names MUST remain independent of Malloy config connection types; changing the execution engine SHOULD be a config change unless the model's connection name or table path intentionally changes.
- 02.05.007: The MCP Malloy runtime MUST load/register connection packages for supported configured connection types before execution.
- 02.05.008: If Malloy config uses an unsupported connection type, ontology source loading or `run_query` MUST return a clear diagnostic or execution error naming the unsupported type.
- 02.05.009: `run_query` MUST require a positive integer `query_limit_seconds` execution-control parameter.
- 02.05.010: Successful `run_query` execution results MUST include `execution_time_ms`.
- 02.05.011: Queries that exceed `query_limit_seconds` MUST return a timeout execution error with elapsed runtime information.
- 02.05.012: `run_query` MUST omit the full compiled Malloy model from its default response while still returning the extracted query Malloy.
- 02.05.013: `load_ontology` MUST return the full compiled Malloy model only when `return_malloy_model` or `returnMalloyModel` is true.
- 02.05.014: `run_query` MUST support `dry_run_only` / `dryRunOnly` to validate and return query Malloy without executing the query or requiring `query_limit_seconds`.
- 02.05.015: MCP runtime override settings MUST remain manageable from `SEMLANG_`-prefixed environment variables or equivalent CLI/tool parameters for Malloy config path and export directory.
- 02.05.016: Every `run_query` request MUST generate and return a transaction GUID that can be used to trace logs and exported output.
- 02.05.017: When executed `run_query` row output is larger than 10 lines, MCP MUST write the rows to a JSON file in the configured export directory using the transaction GUID as the file name and MUST return the export path and line count instead of inline rows.
- 02.05.018: Executed `run_query` MCP responses MUST omit verbose execution internals including generated SQL, execution engine name, query name, query limit, and success-path timeout flags from the `execution` object.
- 02.05.019: `invoke_action` MUST use the Malloy config context captured by `load_ontology` when executing generated action SQL.
- 02.05.020: `invoke_action` MUST support `dry_run_only` / `dryRunOnly` to return generated action SQL without executing it.
- 02.05.021: `invoke_action` generated write SQL SHOULD avoid dialect-specific `RETURNING`, `UPDATE ... FROM`, and `DELETE ... USING` constructs in the default lowering path.
- 02.05.022: `invoke_action` SQL execution MUST apply a positive integer execution deadline, defaulting to 30 seconds when no `query_limit_seconds` value is supplied.
- 02.05.023: MCP execution-control parameters for query deadlines MUST accept timer-safe positive integer second values that arrive as strings through MCP argument serialization.
- 02.05.024: `run_query` MUST reuse the compiled Malloy model cached by `load_ontology` for named and temporary queries instead of regenerating the ontology's base Malloy model for each call.
- 02.05.025: The MCP `tools/list` manifest SHOULD stay within the current tested token budget so tool metadata does not unnecessarily inflate agent context.
- 02.05.026: MCP tools MUST NOT be duplicated under alternate aliases such as both dot-separated and underscore-separated names, and the server MUST expose only the minimal tool names necessary for agent use.
- 02.05.027: MCP tools MUST omit default task execution metadata when the protocol default already communicates that task support is forbidden.
- 02.05.028: The public MCP tool manifest MUST expose the consolidated tool names `load_ontology`, `search`, `describe`, `find_paths`, `run_query`, and `invoke_action` for the core agent workflow.
- 02.05.029: The public MCP tool manifest MUST NOT expose separate public tools for semantic search, entity resolution, lens suggestion, concept detail, action detail, role detail, metric explanation, temporal-axis detail, lens description, lens expansion, required lens fields, lens planning, or derive-style reasoning when those capabilities are covered by `search`, `describe`, or `find_paths`.
- 02.05.030: Public MCP tool input schemas MUST be meaningful and specific enough for agents to choose valid arguments without relying on prose-only descriptions, including explicit modes or discriminators where a consolidated tool performs more than one operation.
- 02.05.031: `search` MUST fold semantic metadata search, entity/name resolution, lens suggestion, and derive-style candidate ranking into one request surface without exposing implementation-shaped planning knobs.
- 02.05.032: `describe` MUST fold concept, action, role, metric, temporal-axis, and lens detail into one request surface, including lens expansion, required lens fields, and lens plan details.
- 02.05.033: `find_paths` MUST remain a separate public tool because path exploration has a distinct input shape and result contract.
- 02.05.034: `run_query` and `invoke_action` MUST replace the previous public `query.run` and `action.invoke` names.
- 02.05.035: SemLang project configuration MUST be discoverable from `.semlang/settings.yml` by walking upward from the project working directory or explicit start directory.
- 02.05.036: `semlang setup` MUST generate a `.semlang/settings.yml` file from discovered project paths and MUST support `--preview`, `--force`, and `--path`.
- 02.05.037: `semlang setup` MUST discover ontology entrypoints from explicit `--path`, conventional SemLang filenames, or a single shallow `.semlang` file candidate, and MUST report candidates when ambiguous.
- 02.05.038: `semlang setup` MUST discover Malloy config using Malloy-compatible filenames from the ontology entrypoint directory up to the SemLang project root and MUST omit `malloy.configPath` when none is found.
- 02.05.039: Starting SemLang MCP MUST NOT require an existing SemLang project config, but config-dependent tool calls MUST return setup guidance when config is missing.
- 02.05.040: `load_ontology` with no source arguments MUST load the ontology entrypoint and runtime paths from discovered SemLang project config.
- 02.05.041: The public `load_ontology` MCP schema MUST NOT advertise deprecated `projectDir` or `paths` arguments.
- 02.05.042: SemLang project config validation errors MUST identify the `.semlang/settings.yml` file that needs correction.
- 02.05.043: SemLang runtime transaction logging MUST support a managed log level through `SEMLANG_LOG_LEVEL` and the matching MCP CLI/settings surface; automated tests MUST capture SemLang runtime logs and fail on unexpected warnings or errors while allowing expected warning/error logs only through explicit test opt-in.
