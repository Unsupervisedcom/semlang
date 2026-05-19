---
title: OntoQL Language Reference
sidebar_position: 1
---

OntoQL is a semantic modeling language that stays close to Malloy so OntoQL models can compile into Malloy for query execution. It adds an ontology layer beside the analytical model: business concepts, roles, relators, situations, temporal axes, lenses, and validation predicates live in the same file as dimensions, measures, views, and queries.

Version 1 is intentionally conservative. Every accepted construct must either lower to deterministic Malloy or produce diagnostics. The language shape is defined by the retail OntoQL examples and by recurring Malloy patterns in the banking, healthcare, manufacturing, retail, and SaaS examples.

## File Shape

An OntoQL file starts with exactly one package declaration:

```ontoql
package retail.omnichannel_margin_returns
```

Files may include other OntoQL files by relative path:

```ontoql
include "./example.ontoql"
```

Includes are loaded before the including file is resolved. Include cycles are invalid.

After the package and any includes, a file can declare semantic types, named sources, concepts, lenses, and queries:

```ontoql
type: Dollars is currency {
  scale_type: ratio
  currency: "USD"
}

source: sale_line_rows is duckdb.table('retail_line_items')

concept SaleLine is situation from sale_line_rows {
  identity line_item_id :: SaleLineId
}

query: monthly_margin is SaleLine -> {
  group_by:
    sold_month
  aggregate:
    net_sales
  order_by:
    sold_month desc
  limit: 12
}
```

## Read Next

- [Concepts](./concepts.md) explains the ontology layer: concepts, stereotypes, identity, roles, joins, and time.
- [Declarations](./declarations.md) covers package, include, type, field, dimension, measure, view, validation, and query declarations.
- [Sources](./sources.md) covers Malloy-shaped table, SQL, named source, and query source references.
- [Expressions](./expressions.md) describes where expressions appear and how aliases, role tests, joins, and aggregates are interpreted.
- [Lenses](./lenses.md) explains query-time semantic overlays.
- [Diagnostics and Lowering](./diagnostics-lowering.md) summarizes compiler errors and Malloy emission.
- [Schema Vocabulary](./schema-vocabulary.md) describes JSON Schema export and OntoQL extension keywords.
- [Supported Malloy Features](./supported_malloy_features.md) tracks Malloy compatibility row by row.
