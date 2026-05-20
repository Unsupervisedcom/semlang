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
