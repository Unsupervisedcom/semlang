---
name: semlang
description: Use when reading, writing, or running SemLang semantic-model files, including reusable ontology changes, query workflows, and one-off SemLang analysis packages.
---

# SemLang Skill

This is a concise guide for agents that need to read or write SemLang.

SemLang is best understood as Malloy with a semantic ontology layer. Keep Malloy's mental model for sources, joins, dimensions, measures, views, and queries, then add the SemLang differences below.

## Start From Malloy

- A Malloy `source` becomes a SemLang `concept`.
- A Malloy table stays close by: `concept Sale is event from duckdb.table('transactions')`.
- Malloy-style `dimension:`, `measure:`, `view:`, `where:`, `group_by:`, `aggregate:`, and `query: ... -> { ... }` remain the default shape.
- Queries target concepts, not physical source names: `query: q is SaleLine -> { ... }`.
- Every SemLang file starts with exactly one `package` declaration. `include` declarations may follow the package and must come before sources, types, concepts, lenses, and queries.
- SemLang should compile to Malloy. Do not invent syntax that cannot lower clearly.

## Query-First Workflow

- Start by using the existing core semantic model directly. Load the relevant SemLang files and try to answer the task with queries over existing concepts, joins, dimensions, measures, views, and lenses before changing model files.
- When a query cannot express the answer because the core model lacks a reusable business concept, relationship, type, measure, role, view, lens, validation, or source abstraction, add that reusable semantic content to the existing SemLang files that own the domain.
- Keep reusable additions durable and named in business language. Do not hide repeatable semantics inside one-off query text.
- If the work requires complex logic that is specific to a single investigation and is not worth reusing, create a separate `.semlang` file for the task. Put its `package` first, include the relevant core semantic files immediately after the package declaration, define only the task-specific sources, lenses, views, or queries needed there, and run that file instead of polluting the core model.

## What SemLang Adds

- `type:` declarations give primitive values semantic meaning, such as `Dollars`, `CustomerId`, or `BusinessDate`. Primitive bases are `string`, `number`, `date`, `timestamp`, `currency`, and `boolean`.
- Type bodies use JSON Schema-style metadata such as `description`, `enum`, `const`, `default`, `examples`, bounds, `pattern`, and `format`. Use `enum`, not legacy `allowed_values`; use `description`, not legacy `semantics`.
- `source:` declarations name reusable Malloy source expressions. They can wrap a table, SQL expression, another source/concept/query, or a root plus query body: `source: active_sales is Sale -> { where: status = 'active' }`.
- `concept X is kind/event/situation/relator/phase ...` names what a row means, not just where it is stored. A phase names its parent: `concept ClosedStore is phase of Store from ...`.
- Concept `description:` metadata is preserved and appears in exported concept JSON Schema.
- `identity` declares the semantic key and lowers to Malloy `primary_key`.
- A composite identity is comma-separated and lowers through a deterministic generated primary-key dimension.
- `field:` declarations attach semantic types to source-backed fields. A trailing `?` marks nullability; `unique` records uniqueness metadata.
- Joins support `join_one`, `join_many`, and `join_cross`. `join_one` and `join_many` use `on` or `with`; `join_cross` may omit `on` and cannot use `with`.
- A `?` after the join name, as in `join_one customer?: Customer on customer_id`, marks optional participation metadata without changing the emitted Malloy join kind.
- Join targets can be concepts, named sources, roles, or `join_one` inline named-connection sources such as `duckdb.table('customer_profiles')`.
- `role Name when predicate` names a meaningful classification when the name adds business meaning. Its canonical name is `Concept.Name`; use optional `label` and `aliases` metadata for business-language discovery.
- Role tests can use `path is Concept.Role` or an unambiguous short name such as `path is Active`.
- Temporal axes such as `occurrence_time:`, `valid_time:`, `observation_time:`, and `recorded_time:` document event time, valid-time state, observed state time, and load/record time.
- Temporal joins can use `at expression` instead of repeating period containment predicates.
- `validation:` declarations are data-quality rules. They are not query filters.
- Concept `where:` filters restrict the concept source and lower to Malloy source filters.
- `lens:` declarations are query-time overlays for contextual filters or vocabulary, similar in spirit to Malloy source extension but applied to existing semantic names. Lenses can inherit parent lenses, add lens-local types, and refine concepts with fields, joins, roles, dimensions, measures, views, validations, temporal axes, identities, and `where` filters.
- Actions are concept-local write declarations. They describe permitted writes with `subject`, `param:`, `guard:`, `edit:`, write mappings, logs, effects, and `agent:` metadata. They do not lower to Malloy reads.
- Mark source-backed fields `writeable` only when actions may assign them. A writeable source field implies `write: column field_name = value`; a writeable derived dimension must declare explicit write mappings.
- JSON Schema export projects semantic types and source-backed concept row shapes. Ontology features without exact JSON Schema semantics are preserved as `x-semlang-*` metadata rather than translated into misleading native validation keywords.

## Authoring Rules

- Prefer the smallest SemLang construct that carries new meaning.
- Use a role only when the role is reusable and meaningful in business language.
- If a lens only narrows data, write `where:` directly rather than declaring a role for the same predicate.
- Keep grains separate. Do not flatten events, situations, relators, and snapshots into one concept just to make a query shorter.
- Use declared joins and measures instead of spelling long paths from scratch. Prefer `with foreign_key` when joining to a concept by its identity and the shorthand preserves the intended relationship.
- Put fields in `field:` blocks and derived values in `dimension:` or `measure:` blocks.
- Keep aggregate aliases aggregate-safe: raw row fields must be inside aggregate functions.
- Use concept-local `view:` declarations for reusable analytical shapes. Views and queries support `where`, `select`, `project`, `group_by`, `aggregate`, `having`, `calculate`, `nest`, `index`, `order_by`, and `limit`/`top` where valid.
- Use `project:` only as compatibility spelling; expect it to emit as Malloy `select:`.
- Use `top:` only as compatibility spelling; expect it to behave as a row limit.
- Filters may use Malloy-shaped forms such as `?` alternation, `to` ranges, `~`/`!~` matching, and filter strings like `f'this week'`.
- Use lenses for query-time changes to semantic meaning. A query applies them with `with`, and parent/named lenses apply left-to-right to a copied query model.
- Do not use validations as ordinary filters. If a query should exclude rows, use `where:` on the concept, lens refinement, view, or query.
- Do not assign actions to measures, joins, roles, views, validations, identities, or temporal axes. Action edits can target only writeable fields or writeable dimensions.
- Treat action `agent:` metadata as presentation metadata, never authorization.

## File and Source Rules

- Keep `package` first except for comments and blank lines.
- Put all `include` declarations immediately after the package. Includes are model loading, not textual macros, and cycles are invalid.
- Use named Malloy connections in physical sources: `duckdb.table('orders')` or `duckdb.sql("""select ...""")`. Do not write unqualified `table('orders')`.
- A concept `from` clause may reference a table, SQL source, named source, another concept source, or a query result.
- When a named source query is rooted in a concept, SemLang validates the query body against that concept. When rooted in a non-concept source, keep it Malloy-shaped and avoid SemLang-only expression constructs that need concept context.

## Diagnostics and Validation

- The compiler reports parse, duplicate-symbol, unresolved-reference, invalid syntax, temporal join, lens refinement, and aggregate-alias diagnostics with source locations where available.
- Successful compiler artifacts are stage-safe: parse errors block the AST, semantic errors block the semantic model, and a missing semantic model blocks Malloy and JSON Schema output.
- Lint diagnostics are opt-in. They can flag missing `occurrence_time` on events, missing `observation_time` on situations, suspicious type/join modeling, and Malloy SDK validation problems.
- When lint validates generated Malloy, diagnostics may include generated Malloy context and mapped original SemLang locations.

## Requirements Discipline

- Durable language and compiler requirements belong in `requirements/REQ-XX-NAME.md` files.
- Requirement files use RFC 2119 language and stable requirement IDs such as `01.02.001`.
- Every durable requirement ID must be covered by a test and referenced in a test comment using the exact ID, such as `// Covers: 06.01.001`.
- When adding or changing requirements, update tests and run the requirements traceability test so missing or stale requirement comments are caught.
- Compiler functions may reference requirement IDs where the implementation mapping is non-obvious, but tests are the required source of traceability.
- Update the relevant requirement file before or alongside changing compiler behavior.

## Global MCP Install

- Use the live source-backed CLI when configuring agents: `semlang mcp`.
- To install it globally, run `npm install` and `npm link` from your SemLang checkout.
- Project MCP configs should use `{ "command": "semlang", "args": ["mcp"] }` under an `mcpServers.semlang` entry.
- Run `semlang setup` from the agent project before starting agents; it creates `.semlang/settings.yml`.
- Agents should call `load_ontology({})`; the ontology entrypoint, Malloy config path, and export directory come from `.semlang/settings.yml`.
- Use `semlang setup --preview` to inspect generated config, `--path <file>` when entrypoint discovery is ambiguous, and `--force` to overwrite an existing config.
- `load_ontology` still accepts `path`, `configPath`, and `malloyConfigPath` as one-off escape hatches.
- `run_query` uses the captured Malloy config, requires a positive integer `query_limit_seconds`, returns a transaction GUID, and exports row output larger than 10 lines to the managed export directory.
- Restart an already-running MCP session after changing server code; newly-started sessions pick up the latest source directly.

## Common Translations

Malloy:

```malloy
source: line_items is duckdb.table('retail_line_items') extend {
  primary_key: line_item_id
  join_one: sale is transactions on transaction_id = sale.transaction_id
  measure:
    net_sales is sum(net_sales_amount)
}
```

SemLang:

```semlang
concept SaleLine is situation from duckdb.table('retail_line_items') {
  identity line_item_id :: SaleLineId
  join_one sale: Sale on transaction_id

  field:
    net_sales_amount :: Dollars

  measure:
    net_sales is sum(net_sales_amount)
}
```

Lens filter:

```semlang
lens: western_region is {
  refine: Store extend {
    where: region = 'West'
  }

  refine: SaleLine extend {
    where: sale.store.region = 'West'
  }
}
```

Action:

```semlang
concept SupplierLot is kind from duckdb.table('supplier_lots') {
  identity supplier_lot_id :: SupplierLotId

  field:
    status :: SupplierLotStatus writeable
    quarantine_reason :: QuarantineReason? writeable

  action quarantine {
    subject: single

    param:
      reason :: QuarantineReason

    guard:
      this.status in ['received', 'released']
        else "Only received or released lots can be quarantined."

    edit:
      set status = 'quarantined'
      set quarantine_reason = reason

    agent:
      expose: true
      risk: high
      requires_confirmation: true
  }
}
```

## When Unsure

Choose the Malloy-shaped expression first, then add SemLang semantics only where they clarify package structure, source reuse, identity, concept type, role meaning, time, validation, query-time context, JSON Schema metadata, or write intent.
