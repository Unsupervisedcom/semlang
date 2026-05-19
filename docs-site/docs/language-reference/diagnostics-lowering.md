---
title: Diagnostics and Lowering
sidebar_position: 7
---

OntoQL's compiler has two obligations: accepted constructs must lower deterministically to Malloy, and invalid constructs must produce diagnostics with useful locations.

## Malloy Lowering

OntoQL emits the Malloy source expression written in the declaration:

```malloy
source: retail_line_items is duckdb.table('retail_line_items') extend {
  primary_key: line_item_id
}
```

Source declarations must use real Malloy source syntax, including named connections such as `duckdb.table('retail_line_items')` or `duckdb.sql("""select ...""")`. Unqualified `table('...')` is diagnosed because it would hide a connection decision in the OntoQL compiler. The compiler may emit semantically equivalent Malloy rather than byte-for-byte matching hand-written fixtures.

Semantic-only constructs lower as follows:

- Concept source becomes a Malloy `source` over its table, SQL, named source, concept, or query source expression.
- Identity becomes `primary_key`.
- Composite identity becomes a concatenated primary key.
- Field declarations are assumed to be source columns; only derived fields emit.
- Role predicates become boolean dimensions.
- `path is Role` tests become predicate substitutions with path prefixes.
- Temporal `at` joins become valid-time containment predicates.
- Lens `where` refinements become source or query `where` clauses.
- Semantic type formatting becomes Malloy annotations where supported.

## Query Lowering

Queries target concepts:

```ontoql
query: monthly_margin is SaleLine -> {
  group_by:
    sold_month
  aggregate:
    net_sales
}
```

Lowering resolves the root concept to the generated Malloy source name and emits a Malloy query. Query and view bodies preserve Malloy-shaped `where:`, `select:`/`project:`, `group_by:`, `aggregate:`, `having:`, `calculate:`, `nest:`, `index:`, `order_by:`, and `limit:`/`top:` clauses. When a query applies lenses, the compiler creates a query-specific semantic model, emits lens-refined sources for that query, and points the query at the refined root source.

## Diagnostics

The compiler reports line and column diagnostics for parse errors and semantic diagnostics for invalid model references.

V1 diagnostics cover:

- Duplicate packages, types, concepts, roles, joins, measures, dimensions, views, queries, and lenses.
- Missing package declarations.
- Unresolved type, concept, role, lens, join path, and field references.
- Include cycles.
- Invalid type, concept, join, role, refinement, validation, view, query, and typed-name syntax.
- Unexpected top-level, concept, lens, and query members.
- Temporal joins targeting concepts without valid time.
- Invalid lens refinements.
- Aggregate aliases that reference unknown fields.
- Aggregate aliases that reference raw row-level fields outside aggregate functions.

## Validation Status

Validations are preserved in the semantic model:

```ontoql
validation:
  closed_after_opened is {
    description: "A store cannot close before it opens."
    predicate: closed_date is null or closed_date >= opened_date
  }
```

They are executable predicates whose false rows represent data-quality errors, but V1 does not emit validations into analytical Malloy queries by default.
