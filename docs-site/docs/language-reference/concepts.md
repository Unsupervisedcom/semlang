---
title: Concepts
sidebar_position: 2
---

Concepts are OntoQL's main modeling unit. A concept declares an ontological classifier and the Malloy source expression that backs it.

```ontoql
concept SaleLine is situation from duckdb.table('retail_line_items') {
  identity line_item_id :: SaleLineId
}
```

The compiler emits each concept as a Malloy source. Semantic members such as roles, temporal axes, and validations enrich that source before or during lowering.

Concept `from` clauses use Malloy source description:

```ontoql
source: recent_sales is duckdb.sql("""select * from sales where sold_at >= '2026-01-01'""")

concept RecentSale is event from recent_sales {
  identity sale_id :: SaleId
}

query: sales_by_status is RecentSale -> {
  group_by:
    status
  aggregate:
    sale_count is count()
}

concept SaleStatus is situation from sales_by_status {
  identity status :: string
}
```

Use explicit connection names, such as `duckdb.table('customers')` and `duckdb.sql("""...""")`. Named sources, concept sources, and query declarations can also be used as source references.

## Stereotypes

V1 supports these concept stereotypes:

- `kind`: an identity-bearing sortal such as `Customer` or `Store`.
- `event`: an occurrence such as `Sale` or `ReturnLine`.
- `situation`: an observed state or stateful row such as inventory or line-item state.
- `relator`: a relationship object such as a promotion allocation.
- `phase of Parent`: a temporal or specialized state of another concept.

```ontoql
concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: CustomerId
}

concept ClosedStore is phase of Store from duckdb.table('stores') {
  identity store_id :: StoreId
  role Closed when closed_date is not null
}
```

## Identity

`identity` declares one or more source-backed key fields:

```ontoql
identity line_item_id :: SaleLineId
```

Composite identities are comma-separated:

```ontoql
identity store_id :: StoreId, snapshot_date :: BusinessDate
```

When a concept lowers to Malloy, a single identity becomes `primary_key: field`. Composite identities lower to a deterministic concatenation such as `concat(field1, '|', field2)`.

## Fields

`field:` blocks declare source-backed fields and attach semantic types:

```ontoql
field:
  store_id :: StoreId
  closed_date :: BusinessDate?
  email :: EmailAddress unique
```

The trailing `?` marks a nullable value. The optional `unique` marker records uniqueness metadata on a field.

## Joins

`join_one` and `join_many` declare Malloy joins and semantic participation:

```ontoql
join_one customer?: Customer on customer_id
join_many returns: ReturnLine on line_item_id = original_line_item_id
join_one store: Store with store_id
join_cross fiscal_calendar: FiscalCalendar
```

The `?` marker after the join name means participation is optional. It is semantic metadata; Malloy emission still uses the declared join kind.
`with` joins use Malloy's foreign-key shorthand and require a target identity when OntoQL can resolve the target concept.

A join target can also name a role. V1 resolves the role to its base concept and applies the role predicate as part of validation and expression lowering.

## Temporal Axes

Temporal axes give business time semantics to a concept:

```ontoql
occurrence_time: sold_at
valid_time: period(valid_from, valid_to)
observation_time: snapshot_date
recorded_time: loaded_at
```

A temporal join may use `at expression` when the target has `valid_time`:

```ontoql
join_one product_at_sale: ProductSKUVersion
  on sku_id = product_at_sale.sku_id
  at sale.sold_at
```

If the target valid time is `period(start, end)`, lowering adds containment predicates equivalent to `expression >= target.start` and `expression < target.end`.

## Roles

Roles are named predicates over a concept:

```ontoql
role LoyaltyCustomer when loyalty_member_id is not null
```

Roles can be tested in expressions:

```ontoql
customer is LoyaltyCustomer
```

During Malloy emission, role tests lower to their predicates with the correct path prefix.
