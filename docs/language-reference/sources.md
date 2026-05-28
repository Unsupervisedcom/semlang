---
title: Sources
sidebar_position: 4
---

SemLang source clauses are intentionally Malloy-shaped. A concept's `from` clause takes a Malloy source expression; the compiler validates the expression form and preserves it when lowering.

## Tables

Use a named Malloy connection:

```semlang
concept SaleLine is situation from duckdb.table('retail_line_items') {
  identity line_item_id :: string
}
```

SemLang does not treat `table('retail_line_items')` as a magic default. If the source is DuckDB, BigQuery, Postgres, or another Malloy connection, put that connection name in the declaration.

## SQL Sources

SQL sources also use the connection:

```semlang
concept RecentSale is event from duckdb.sql("""
  select * from sales where sold_at >= '2026-01-01'
""") {
  identity sale_id :: string
}
```

The SQL string is passed through to Malloy as part of the source expression.

## Named Sources

Reusable Malloy-style sources can be declared at the top level and then used by concepts:

```semlang
source: sale_rows is duckdb.table('sales')

concept Sale is event from sale_rows {
  identity sale_id :: string
}
```

## Query Sources

Queries can be referenced as sources where Malloy accepts query outputs:

```semlang
query: sales_by_status is Sale -> {
  group_by:
    status
  aggregate:
    total_amount
}

concept SaleStatus is situation from sales_by_status {
  identity status :: string
}
```

When a concept is backed by a query result, SemLang emits the query before the concept source that extends it.

## Source Queries

Named sources can also be declared from another source plus a query body:

```semlang
source: sales_by_status is Sale -> {
  group_by:
    status
  aggregate:
    total_amount
}
```

When the source root is a concept, SemLang validates the query body against that concept before emitting Malloy.
