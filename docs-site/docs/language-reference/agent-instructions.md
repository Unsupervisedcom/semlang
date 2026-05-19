---
title: Agent Instructions
sidebar_position: 8
---

This is a concise guide for agents that need to read or write OntoQL.

OntoQL is best understood as Malloy with a semantic ontology layer. Keep Malloy's mental model for sources, joins, dimensions, measures, views, and queries, then add the OntoQL differences below.

## Start From Malloy

- A Malloy `source` becomes an OntoQL `concept`.
- A Malloy table stays close by: `concept Sale is event from duckdb.table('transactions')`.
- Malloy-style `dimension:`, `measure:`, `view:`, `where:`, `group_by:`, `aggregate:`, and `query: ... -> { ... }` remain the default shape.
- Queries target concepts, not physical source names: `query: q is SaleLine -> { ... }`.
- OntoQL should compile to Malloy. Do not invent syntax that cannot lower clearly.

## What OntoQL Adds

- `type:` declarations give primitive values semantic meaning, such as `Dollars`, `CustomerId`, or `BusinessDate`.
- `concept X is kind/event/situation/relator/phase ...` names what a row means, not just where it is stored.
- `identity` declares the semantic key and lowers to Malloy `primary_key`.
- `role Name when predicate` names a meaningful classification when the name adds business meaning. Do not create roles that only restate an existing filter.
- Temporal axes such as `occurrence_time:` and `valid_time:` document event time and valid-time state.
- Temporal joins can use `at expression` instead of repeating period containment predicates.
- `validation:` declarations are data-quality rules. They are not query filters.
- `lens:` declarations are query-time overlays for contextual filters or vocabulary, similar in spirit to Malloy source extension but applied to existing semantic names.

## Authoring Rules

- Prefer the smallest OntoQL construct that carries new meaning.
- Use a role only when the role is reusable and meaningful in business language.
- If a lens only narrows data, write `where:` directly rather than declaring a role for the same predicate.
- Keep grains separate. Do not flatten events, situations, relators, and snapshots into one concept just to make a query shorter.
- Use declared joins and measures instead of spelling long paths from scratch.
- Put fields in `field:` blocks and derived values in `dimension:` or `measure:` blocks.
- Keep aggregate aliases aggregate-safe: raw row fields must be inside aggregate functions.

## Requirements Discipline

- Durable language and compiler requirements belong in `requirements/REQ-XX-NAME.md` files.
- Requirement files use RFC 2119 language and stable requirement IDs such as `01.02.001`.
- Compiler functions and tests should reference the requirement ID they implement or protect when a clear local reference is practical.
- Update the relevant requirement file before or alongside changing compiler behavior.

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

OntoQL:

```ontoql
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

```ontoql
lens: western_region is {
  refine: Store extend {
    where: region = 'West'
  }

  refine: SaleLine extend {
    where: sale.store.region = 'West'
  }
}
```

## When Unsure

Choose the Malloy-shaped expression first, then add OntoQL semantics only where they clarify identity, concept type, role meaning, time, validation, or query-time context.
