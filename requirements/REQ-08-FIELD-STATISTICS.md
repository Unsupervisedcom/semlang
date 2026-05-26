# REQ-08-FIELD-STATISTICS: Indexed Field Statistics

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern indexed field declarations, runtime statistics collection, cached value search, and MCP concept introspection.

## 08.01 Indexed Member Declarations

Indexed members opt in to runtime statistics collection.

- 08.01.001: Fields MAY declare an `indexed` modifier after their typed declaration.
- 08.01.002: Dimensions MAY declare an `indexed` modifier after their definition expression.
- 08.01.003: Measures MAY declare an `indexed` modifier after their definition expression.
- 08.01.004: The compiler MUST preserve indexed metadata in the semantic model and JSON Schema metadata.
- 08.01.005: Indexed metadata MUST NOT change Malloy emission.

## 08.02 MCP Settings

MCP controls statistics refresh through managed settings.

- 08.02.001: MCP MUST support `update_stats` / `SEMLANG_UPDATE_STATS`, defaulting to enabled.
- 08.02.002: MCP MUST support disabling statistics refresh without preventing ontology loading.
- 08.02.003: MCP SHOULD cache statistics under a project-local `.semlang/cache/field-stats/v1` directory by default.
- 08.02.004: MCP MUST bound complete value lists with `completeValueMaxDistinctCount`.
- 08.02.005: MCP MUST bound sampled value lists with `sampleValueMaxCount`.
- 08.02.006: MCP MUST bound concurrent field statistics queries with `maxParallelQueries`.
- 08.02.007: When MCP creates a project-local `.semlang` directory for statistics caching, it MUST create or update `.semlang/.gitignore` so the cache directory is ignored by Git.

## 08.03 Collection and Cache

Statistics are auxiliary discovery data.

- 08.03.001: MCP MUST collect statistics only for explicitly indexed members.
- 08.03.002: Field and dimension statistics SHOULD include row count, non-null count, null count, distinct count, min, max, and cached values when the execution engine can provide them.
- 08.03.003: If distinct non-null value count is at or below `completeValueMaxDistinctCount`, cached values MUST be marked `complete`.
- 08.03.004: If distinct non-null value count is above `completeValueMaxDistinctCount`, cached values MUST be marked `sample`.
- 08.03.005: Measure statistics MUST represent concept-scope aggregate values and MUST NOT be presented as row-level sample values.
- 08.03.006: Cache keys MUST include model/config fingerprints, member identity, member expression/type, source expression, and value-bound settings.
- 08.03.007: Statistics refresh failures MUST be reported as warnings/status and MUST NOT block ontology loading.

## 08.04 Search Predicates

Cached string values support compact semantic search hints.

- 08.04.001: Term and phrase search SHOULD search cached string values from indexed field and dimension statistics.
- 08.04.002: Cached value matches MUST be returned as compact predicate matches rather than full statistics payloads.
- 08.04.003: Predicate matches MUST include concept, member, member kind, value, predicate text, score, and matched terms.
- 08.04.004: Broad search and reasoning responses MUST NOT include full cached value lists.

## 08.05 Concept Introspection

Concept introspection is the explicit surface for statistics payloads.

- 08.05.001: `describe` with `kind: "concept"` MUST support `include_stats` / `includeStats`.
- 08.05.002: Concept `describe` SHOULD include statistics by default because it targets one explicit concept.
- 08.05.003: When `include_stats` is false, concept members MUST expose only indexed metadata and statistics availability, not cached values.
- 08.05.004: Broad model summaries and concept lists MUST NOT include full statistics payloads.
