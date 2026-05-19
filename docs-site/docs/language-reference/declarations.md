---
title: Declarations
sidebar_position: 3
---

OntoQL declarations define packages, reusable semantic types, concepts, analytical members, validations, lenses, and queries. Declarations use a Malloy-like shape but carry additional semantic information for OntoQL resolution and lowering.

## Package and Include

Every OntoQL file must declare one package:

```ontoql
package retail.omnichannel_margin_returns
```

Use `include` to load another OntoQL file before resolving the current file:

```ontoql
include "./shared-types.ontoql"
```

Includes are relative paths. Include cycles are invalid.

## Semantic Types

Semantic types name value domains over primitive Malloy-compatible values:

```ontoql
type: Dollars is currency {
  scale_type: ratio
  currency: "USD"
  render_format: currency("USD", 2)
}
```

V1 primitive bases are:

- `string`
- `number`
- `date`
- `timestamp`
- `currency`
- `boolean`

Type bodies are metadata maps. Recognized JSON Schema-style metadata includes `description`, `enum`, `const`, `default`, `examples`, numeric and string bounds, `pattern`, and `format`. OntoQL-specific metadata includes `scale_type`, `identifies`, `identifies_role`, `currency`, `unit`, and `render_format`. Unknown metadata is preserved in the AST and semantic model but does not affect Malloy emission.

## Sources and Concepts

Use `source:` to name a reusable Malloy source expression:

```ontoql
source: store_rows is duckdb.table('stores')
source: active_store_rows is duckdb.sql("""select * from stores where closed_date is null""")
```

A concept declaration binds an ontological classifier to a Malloy source expression:

```ontoql
concept Store is kind from store_rows {
  identity store_id :: StoreId

  field:
    region :: Region
    opened_date :: BusinessDate
}
```

The source expression uses Malloy's named connection forms. Use `duckdb.table('stores')`, `bigquery.table('dataset.table')`, `duckdb.sql("""select ...""")`, or a named source/query reference. OntoQL does not invent an implicit connection for `table('stores')`.

Concept bodies can contain identities, temporal axes, fields, joins, roles, dimensions, measures, views, validations, and `where` filters.

## Dimensions and Measures

OntoQL preserves Malloy's declaration shape for dimensions and measures:

```ontoql
dimension:
  margin_amount is net_sales_amount - merchandise_cost_amount

measure:
  net_sales is sum(net_sales_amount)
```

Definitions may include an optional semantic type annotation:

```ontoql
measure:
  gross_sales :: Dollars is sum(gross_sales_amount)
```

## Views

Views are concept-local analytical shapes:

```ontoql
view: sales_by_region_category is {
  group_by:
    sold_month
    sale.store.region
  aggregate:
    net_sales
}
```

A view body can contain `where:`, `select:`/`project:`, `group_by:`, `aggregate:`, `having:`, `calculate:`, `nest:`, `index:`, `order_by:`, and `limit:`/`top:` sections.

## Validations

Validations are executable predicates whose false rows represent data-quality errors:

```ontoql
validation:
  closed_after_opened is {
    description: "A store cannot close before it opens."
    predicate: closed_date is null or closed_date >= opened_date
  }
```

V1 preserves validations in the semantic model. They are not emitted into analytical Malloy queries by default.

## Queries

Queries target concepts rather than physical sources:

```ontoql
query: monthly_margin_and_returns is SaleLine -> {
  group_by:
    sold_month
  aggregate:
    net_sales
}
```

A query can apply one or more lenses:

```ontoql
query: western_margin is SaleLine with western_region -> {
  aggregate:
    net_sales
}
```

Query bodies use the same sections as views, including Malloy-shaped projection, post-aggregate filtering, nesting, indexing, ordering, and limiting clauses.
