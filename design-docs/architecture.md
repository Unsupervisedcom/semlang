# SemLang Compiler Architecture

This document explains the current SemLang compiler strategy for future implementers.
The compiler is intentionally conservative: it accepts the subset of SemLang described in `packages/semlang/design-docs/language.md`, builds a semantic model, and emits deterministic Malloy text.
When a construct cannot be parsed, resolved, validated, expanded through lenses, or emitted predictably, the compiler should report diagnostics instead of guessing.

## Public Entry Points

The public API is exported from `src/index.ts`:

- `compileSemLang(source, options)`: parse, resolve, validate, and emit Malloy from an in-memory source string.
- `compileFile(filePath, options)`: read a file, install the default file-based package loader, and compile it.
- `parseSemLang(source, options)`: produce an `SemLangAst` plus parse diagnostics.
- `resolveSemLang(ast, options)`: load includes, merge declarations, validate semantics, and produce a `SemanticModel`.
- `emitMalloy(model, options)`: lower a resolved model to Malloy text.
- `emitJsonSchema(model, options)`: project semantic types and concept row shapes to JSON Schema draft 2020-12.
- `applyQueryLenses(model, query, diagnostics)`: clone a model and apply the lenses named by a query.
- `filePackageLoader()`: resolve `include` paths relative to the including file.

The main public artifacts are:

- `SemLangAst`: the syntactic tree returned by the parser.
  It preserves source locations and declaration structure.
- `SemanticModel`: the resolved package graph.
  It indexes types, concepts, lenses, and queries by their compiler names.
- `ResolvedConcept`: a concept declaration plus compiler metadata such as `sourceName` and `roleBaseNames`.
- `CompileResult`: the aggregate result containing any available `ast`, `model`, emitted `malloy`, emitted `jsonSchema`, and all diagnostics.
- `Diagnostic`: a stable error or warning record with severity, code, message, and optional source location.

Callers should treat diagnostics as part of the API contract.
If `ast`, `model`, `malloy`, or `jsonSchema` is absent, the diagnostics explain why that stage could not continue.

## Pipeline Overview

`compileSemLang` currently runs the pipeline in this order:

1. Parse source text into an `SemLangAst`.
2. Resolve includes and merge AST declarations into a `SemanticModel`.
3. Validate the semantic model, including query-specific lens overlays.
4. Emit Malloy from the validated semantic model.
5. Emit JSON Schema from the validated semantic model.

The implementation keeps the stages separate even where the resolver currently owns both resolution and validation.
That separation is useful: future work can add richer parsing, semantic passes, emitters, or tooling without changing the high-level contract.

## Parse Stage

The parser in `src/parser.ts` is a pragmatic line/block parser rather than a full grammar-driven parser.
It recognizes top-level package, include, ignored, source, type, concept, lens, and query declarations.
Concept and refinement bodies are parsed into common member structures so normal concepts and lens refinements share the same declaration shape.

Parser responsibilities:

- Preserve line and column information on declarations and malformed constructs.
- Keep metadata entries and expression strings mostly intact for later stages.
- Reject invalid declaration shapes early with parse diagnostics.
- Return no AST when any parse error is present.

The parser should stay syntax-focused.
It should not need global knowledge of known types, concepts, roles, joins, or lenses.
Those checks belong in resolution and validation.

## Resolve Stage

Resolution lives in `src/resolver.ts`.
`resolveSemLang` first loads the include graph through the configured `PackageLoader`.
Includes are resolved before the including file, and include cycles are reported as `INCLUDE_CYCLE`.

After loading, `mergeAst` builds a `SemanticModel`:

- Ignored source declarations are appended to `model.ignored` as metadata-only declarations.
- Types are stored in `model.types`.
- Concepts are stored in `model.concepts` as `ResolvedConcept` values.
- Lenses are stored in `model.lenses`.
- Queries are appended to `model.queries`.
- Duplicate package-level names are diagnosed during merge.

The current compiler uses compiler names directly as model keys for package-level declarations.
Roles are concept-local: each role has a canonical qualified name such as `Customer.Active`, while short role names are resolved through the tested path when possible.
There is not yet a general import alias model beyond file includes, so added language features should still be careful about symbol visibility and collision behavior.

## Validate Stage

Validation currently runs inside `validateModel` in the resolver.
It validates the base model and then validates each query against the query model produced by lens expansion.

Validation responsibilities:

- Require reasons for ignored source declarations and reject duplicate ignored source expressions or ignored sources that are also modeled.
- Check primitive and semantic type references.
- Check duplicate fields, joins, roles, dimensions, measures, views, queries, lenses, and package-level declarations.
- Resolve join targets against concepts and roles.
- Validate temporal `at` joins against targets with `valid_time`.
- Validate role predicates, source filters, dimensions, measures, validations, views, and query bodies.
- Check query roots and path expressions.
- Reject aggregate aliases that reference raw row-level fields outside aggregate functions.

Expression validation is intentionally lightweight.
It tokenizes paths and recognizes a small set of aggregate functions, scalar functions, scalar date/time properties, and expression keywords.
This keeps the compiler useful for current examples without pretending to be a full Malloy or SQL expression analyzer.

## Lens Expansion

Lenses are query-time semantic overlays.
They do not mutate the base `SemanticModel`.

`applyQueryLenses` clones the model, then applies the lenses listed on the query from left to right.
`applyLens` recursively applies parent lenses before the child lens and tracks the current stack to report `LENS_CYCLE`.

Current lens behavior:

- Lens-defined types are added to the cloned model if the name is not already present.
- Each `refine: Concept extend { ... }` block appends its members to the cloned target concept.
- Lens `where:` refinements become additional concept filters.
- Multiple lens filters compose by conjunction during emission because each filter emits as a separate Malloy `where:`.
- Lens filters apply across the query-local concept graph.
  A query rooted at `Customer` can join to a lens-expanded `SaleLine` source, and measures such as `sale_lines.sum(net_sales_amount)` aggregate over the filtered sale-line source rather than the base source.
- The base model remains available for other queries and for non-lensed emission.

Emission also uses lens expansion.
For lensed queries, the emitter generates query-local sources with names like `source_name__query_name` so the lens-expanded concept graph can coexist with the base sources in the same Malloy output.

## Emit Stage

`src/emitter.ts` lowers a validated `SemanticModel` to Malloy text.
It emits named raw sources, concept sources, query-backed sources, queries, and finally concepts backed by query results.
If a query uses lenses, it emits the lens-expanded sources for that query before the query itself.

Important lowering rules:

- Concepts become Malloy `source` declarations over Malloy source expressions such as `duckdb.table(...)`, `duckdb.sql("""...""")`, named source references, and query results.
- Identities become `primary_key`; composite identities lower through deterministic generated dimensions so `primary_key:` always points at a field name.
- Joins become Malloy joins, including role-target predicates and valid-time containment for temporal joins.
- Roles become boolean dimensions named with an `is_...` prefix and role tests are lowered into predicates.
- Concept `where:` entries become Malloy source filters.
- Dimensions, measures, views, and queries preserve the SemLang declaration shape where possible.
- Currency metadata may emit a Malloy annotation when the compiler can infer it from referenced fields.

The emitter assumes it receives a validated model.
It may still append diagnostics for lens expansion failures discovered while emitting lensed queries, but semantic failures should normally have been found before emission.

## Diagnostics Philosophy

Diagnostics should be precise, stable, and stage-local:

- Use stable `code` values that tests and tools can assert on.
- Include source locations whenever the compiler has a meaningful location.
- Prefer reporting all independent errors in a pass rather than stopping at the first error.
- Stop crossing a stage boundary when the stage's artifact would be unsafe or misleading.
- Report an error instead of silently dropping declarations that affect semantics.

The current stage boundaries are:

- Parse errors prevent `ast` from being returned.
- Resolution or validation errors prevent `model` and Malloy output from being returned by `compileSemLang`.
- Emission diagnostics are accumulated into `CompileResult.diagnostics` alongside earlier diagnostics.

Warnings are supported by the type system but are not heavily used yet.
Before adding warnings, decide whether callers should treat them as advisory metadata or as policy signals.

## Test Strategy

Tests live under `test/` and should protect both compiler behavior and public artifacts.

Use focused compiler tests for:

- Parser structure and source locations.
- Core lowering behavior.
- Lens-local source generation.
- Source modes such as `bare` and `duckdb`.
- Diagnostic codes for semantic failures.
- Include-cycle and package-loader behavior.

Use fixture tests for:

- Compiling every `example*.semlang` file in each example domain.
- Ensuring real-world examples produce no diagnostics and emit non-empty Malloy.

Use integration tests for:

- Boundaries with optional Malloy/DuckDB runtime packages.
- Verifying generated text remains suitable for downstream runtime loading without depending on unstable Malloy internals.

When adding a language feature, prefer one small semantic test that isolates the feature and one fixture-oriented assertion if the examples rely on it.
Diagnostics tests should assert codes and important locations, not full prose, unless the wording itself is the behavior being protected.

## Known Limitations

The current compiler is deliberately V1-shaped:

- Parsing is line/block based, so nested expression syntax is mostly preserved as strings rather than parsed into expression ASTs.
- Expression validation is heuristic and does not fully understand Malloy or SQL precedence, function signatures, quoted identifiers, or every legal expression form.
- There is no general import alias model beyond file includes and package-level duplicate checks; role names have a narrow concept-qualified namespace.
- Lenses append refinements; they do not support removing, overriding, or relaxing earlier declarations or filters.
- Lens-added type name conflicts are currently ignored during application if the type already exists.
- The semantic model uses mutable arrays and maps internally, so cloning is required before query-time overlays.
- Validations are preserved and typechecked but are not emitted as executable data-quality queries by default.
- Emitter output is deterministic text, not a Malloy AST, so formatting and expression lowering are intentionally simple.
- The compiler does not verify that referenced physical table columns exist.
- Runtime execution is outside the compiler boundary; tests mostly verify generated Malloy text and optional runtime package availability.

Future implementers should keep these limitations visible.
The safest evolution path is to replace narrow heuristics with explicit intermediate representations only when a feature needs that precision, while preserving the current public artifacts and diagnostic behavior for callers.
