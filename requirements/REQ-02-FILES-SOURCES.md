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

- 02.05.001: `set_ontology_source` MUST accept an explicit Malloy config path through `configPath` or `malloyConfigPath`, and that explicit path MAY use any JSON filename.
- 02.05.002: When no explicit Malloy config path is supplied, `set_ontology_source` MUST discover `malloy-config-local.json` or `malloy-config.json` by walking upward from the SemLang model directory.
- 02.05.003: When no explicit Malloy config path is supplied and discovery fails, `set_ontology_source` MUST return a clear setup error and MUST NOT synthesize an implicit fallback connection.
- 02.05.004: `set_ontology_source` MUST store the resolved Malloy project directory, config path, and config source in MCP context for later query execution.
- 02.05.005: `query.run` MUST execute generated Malloy through the Malloy SDK using the config context captured by `set_ontology_source`.
- 02.05.006: SemLang source connection names MUST remain independent of Malloy config connection types; changing the execution engine SHOULD be a config change unless the model's connection name or table path intentionally changes.
- 02.05.007: The MCP Malloy runtime MUST load/register connection packages for supported configured connection types before execution.
- 02.05.008: If Malloy config uses an unsupported connection type, ontology source loading or `query.run` MUST return a clear diagnostic or execution error naming the unsupported type.
- 02.05.009: `query.run` MUST require a positive integer `query_limit_seconds` execution-control parameter.
- 02.05.010: Successful `query.run` execution results MUST include `execution_time_ms`.
- 02.05.011: Queries that exceed `query_limit_seconds` MUST return a timeout execution error with elapsed runtime information.
