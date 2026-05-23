---
title: Declarations
sidebar_position: 3
---

SemLang declarations define packages, reusable semantic types, concepts, analytical members, validations, lenses, and queries. Declarations use a Malloy-like shape but carry additional semantic information for SemLang resolution and lowering.

## Package and Include

Every SemLang file must declare one package:

```semlang
package retail.omnichannel_margin_returns
```

Use `include` to load another SemLang file before resolving the current file:

```semlang
include "./shared-types.semlang"
```

Includes are relative paths. Each resolved include file is merged once per compilation, so shared files can be included by both a root file and downstream domain files. Include cycles are invalid.

## Semantic Types

Semantic types name value domains over primitive Malloy-compatible values:

```semlang
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

Type bodies are metadata maps. Recognized JSON Schema-style metadata includes `description`, `enum`, `const`, `default`, `examples`, numeric and string bounds, `pattern`, and `format`. SemLang-specific metadata includes `scale_type`, `identifies`, `identifies_role`, `currency`, `unit`, and `render_format`. Unknown metadata is preserved in the AST and semantic model but does not affect Malloy emission.

## Sources and Concepts

Use `source:` to name a reusable Malloy source expression:

```semlang
source: store_rows is duckdb.table('stores')
source: active_store_rows is duckdb.sql("""select * from stores where closed_date is null""")
```

A concept declaration binds an ontological classifier to a Malloy source expression:

```semlang
concept Store is kind from store_rows {
  identity store_id :: StoreId

  field:
    region :: Region
    opened_date :: BusinessDate
}
```

The source expression uses Malloy's named connection forms. Use `duckdb.table('stores')`, `bigquery.table('dataset.table')`, `duckdb.sql("""select ...""")`, or a named source/query reference. SemLang does not invent an implicit connection for `table('stores')`.

Concept bodies can contain identities, temporal axes, fields, joins, roles, dimensions, measures, views, validations, and `where` filters.

## Dimensions and Measures

SemLang preserves Malloy's declaration shape for dimensions and measures:

```semlang
dimension:
  margin_amount is net_sales_amount - merchandise_cost_amount

measure:
  net_sales is sum(net_sales_amount) {
    description: "Total recognized net sales."
  }
```

Definitions may include an optional semantic type annotation:

```semlang
measure:
  gross_sales :: Dollars is sum(gross_sales_amount)
```

Definitions may include a block-level `description`. Descriptions on identities, fields, dimensions, and measures are preserved in the semantic model and are exposed through JSON Schema export and MCP ontology introspection.

## Views

Views are concept-local analytical shapes:

```semlang
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

```semlang
validation:
  closed_after_opened is {
    description: "A store cannot close before it opens."
    predicate: closed_date is null or closed_date >= opened_date
  }
```

V1 preserves validations in the semantic model. They are not emitted into analytical Malloy queries by default.

## Queries

Queries target concepts rather than physical sources:

```semlang
query: monthly_margin_and_returns is SaleLine -> {
  group_by:
    sold_month
  aggregate:
    net_sales
}
```

A query can apply one or more lenses:

```semlang
query: western_margin is SaleLine with western_region -> {
  aggregate:
    net_sales
}
```

Query bodies use the same sections as views, including Malloy-shaped projection, post-aggregate filtering, nesting, indexing, ordering, and limiting clauses.
