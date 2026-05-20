# REQ-05-DIAGNOSTICS-LOWERING: Diagnostics and Lowering

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern diagnostic behavior and deterministic lowering to Malloy.

## 05.01 Diagnostic Model

The compiler should prefer precise diagnostics over guessing. When a construct cannot be parsed, resolved, validated, or lowered predictably, compilation should surface the problem.

- 05.01.001: Parse errors MUST produce diagnostics with line and column information when source location is available.
- 05.01.002: Semantic errors MUST produce diagnostics with source locations when the related declaration or expression location is available.
- 05.01.003: Diagnostics MUST include severity, code, message, and optional location.
- 05.01.004: The compiler MUST report missing package declarations.
- 05.01.005: The compiler MUST report duplicate packages, sources, types, concepts, identities, fields, roles, joins, measures, dimensions, views, validations, queries, and lenses where those declarations are supported.
- 05.01.006: The compiler MUST report unresolved type, concept, role, lens, join path, field, view, and source references.
- 05.01.007: The compiler MUST report include cycles.
- 05.01.008: The compiler MUST report invalid type, concept, join, role, refinement, validation, view, query, and typed-name syntax.
- 05.01.009: The compiler MUST report unexpected top-level, concept, lens, and query members.
- 05.01.010: The compiler MUST report temporal joins targeting concepts without valid time.
- 05.01.011: The compiler MUST report invalid lens refinements.
- 05.01.012: The compiler MUST report aggregate aliases that reference unknown fields.
- 05.01.013: The compiler MUST report aggregate aliases that reference raw row-level fields outside aggregate functions.
- 05.01.014: The compiler MUST report ambiguous bare role references when the role short name is declared on multiple concepts and the tested path does not identify one owning concept.

## 05.02 Compilation Stage Safety

Compiler artifacts should only be returned when the stage that produces them has enough valid information to avoid misleading callers.

- 05.02.001: If parsing has errors, the compiler MUST NOT return an AST.
- 05.02.002: If resolution or semantic validation has errors, the compiler MUST NOT return a semantic model.
- 05.02.003: If the semantic model is unavailable, the compiler MUST NOT return Malloy output.
- 05.02.004: If the semantic model is unavailable, the compiler MUST NOT return JSON Schema output.
- 05.02.005: Emission diagnostics MUST be accumulated into the compile result diagnostics.
- 05.02.006: The compiler MAY return warnings alongside successful artifacts.

## 05.03 Malloy Source Lowering

Accepted semantic model constructs lower to deterministic Malloy. The compiler may emit semantically equivalent Malloy rather than byte-for-byte matching hand-written fixtures.

- 05.03.001: A concept source MUST lower to a Malloy `source` over its table, SQL, named source, concept, or query source expression.
- 05.03.002: The emitted Malloy source expression MUST preserve the accepted source expression.
- 05.03.003: A single identity MUST lower to Malloy `primary_key`.
- 05.03.004: A composite identity MUST lower to a deterministic concatenated `primary_key`.
- 05.03.005: Source-backed fields MUST be assumed to exist in the source and MUST NOT emit field definitions by default.
- 05.03.006: Derived dimensions and measures MUST emit into the appropriate Malloy source sections.
- 05.03.007: Role predicates SHOULD lower to boolean dimensions.
- 05.03.008: Semantic type formatting SHOULD lower to Malloy annotations where supported.

## 05.04 Semantic Expression Lowering

Semantic constructs embedded in expressions must lower predictably while preserving ordinary Malloy expression text.

- 05.04.001: `path is Role` tests MUST lower to the target role predicate.
- 05.04.002: When lowering `path is Role`, field references inside the role predicate MUST be prefixed with the tested path.
- 05.04.003: Temporal `at` joins targeting `period(start, end)` valid time MUST lower to containment predicates.
- 05.04.004: Lens `where` refinements MUST lower to source or query `where` clauses.
- 05.04.005: Accepted Malloy expressions SHOULD be preserved except for required semantic substitutions.

## 05.05 Query Lowering

Queries target concepts and lower to Malloy queries over generated source names.

- 05.05.001: Query lowering MUST resolve the root concept to its generated Malloy source name.
- 05.05.002: Query lowering MUST preserve supported query-body clauses.
- 05.05.003: A query targeting a named view MUST lower to a Malloy query that references that view.
- 05.05.004: When a query applies lenses, the compiler MUST create a query-specific semantic model.
- 05.05.005: When a query applies lenses, the compiler MUST emit lens-refined sources for that query.
- 05.05.006: When a query applies lenses, the emitted query MUST target the refined root source.

## 05.06 Validation Lowering Status

Validations are preserved as model metadata in V1, but they are not analytical filters unless a future requirement defines such behavior.

- 05.06.001: The compiler MUST preserve validation declarations in the semantic model.
- 05.06.002: Validation predicates MUST represent false rows or states as data-quality errors.
- 05.06.003: V1 Malloy query emission MUST NOT emit validations into analytical queries by default.

## 05.07 Lint Warnings

Lint warnings identify likely model-quality problems without blocking successful compilation. They are intended for ontology validation surfaces rather than per-query validation.

- 05.07.001: Lint warnings MUST be opt-in and MUST NOT be emitted by default compile or query validation calls.
- 05.07.002: Lint validation SHOULD warn when an `event` concept omits `occurrence_time` or a `situation` concept omits `observation_time`.
- 05.07.003: Lint validation SHOULD warn when a field's semantic type metadata identifies another modeled concept but the owning concept has no join to that target, excluding self-identifying fields and existing joins.
- 05.07.004: Lint validation SHOULD warn when a field name matches a declared semantic type name after case and underscore normalization but the field is declared with a different type.
- 05.07.005: Lint validation SHOULD warn when repeated identifier-like field names use inconsistent semantic types across concepts and at least one occurrence uses a modeled semantic type.
