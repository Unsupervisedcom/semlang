# OntoQL V1 Language Specification

OntoQL is a semantic modeling language that stays close to Malloy so it can be compiled into Malloy for query execution. It adds an ontology layer inspired by gUFO and OntoUML: business concepts, roles, relators, situations, temporal axes, and validation predicates live beside the analytical model instead of in a separate diagram.

V1 is defined by the retail OntoQL examples in `examples/retail-omnichannel-margin-and-returns` and by the recurring Malloy patterns in the banking, healthcare, manufacturing, retail, and SaaS examples. The compiler is intentionally conservative: every accepted construct must lower to deterministic Malloy or produce diagnostics.

## Packages and Includes

An OntoQL file starts with one package declaration:

```ontoql
package retail.omnichannel_margin_returns
```

Files may include other OntoQL files by relative path:

```ontoql
include "./example.ontoql"
```

Includes are loaded before the including file is resolved. Include cycles are invalid.

## Semantic Types

Semantic types are named value domains over primitive Malloy-compatible values:

```ontoql
type: Dollars is currency {
  scale_type: ratio
  currency: "USD"
  render_format: currency("USD", 2)
}
```

V1 primitive bases are `string`, `number`, `date`, `timestamp`, `currency`, and `boolean`. Type bodies are metadata maps. Recognized JSON Schema-style metadata includes `description`, `enum`, `const`, `default`, `examples`, numeric and string bounds, `pattern`, and `format`. OntoQL-specific metadata includes `scale_type`, `identifies`, `identifies_role`, `currency`, `unit`, and `render_format`. Unknown metadata is preserved in the AST and semantic model but does not affect Malloy emission.

Field annotations use Malloy-like `::` syntax. A trailing `?` marks nullable values:

```ontoql
customer_id :: CustomerId?
```

## Sources and Concepts

A concept declares an ontological classifier and the Malloy source expression that backs it:

```ontoql
concept SaleLine is situation from duckdb.table('retail_line_items') {
  identity line_item_id :: SaleLineId
}
```

The `from` clause follows Malloy source semantics. It can reference a table or view through a named connection, a SQL source, a named source, a concept source, or a query result:

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

Use explicit connection names such as `duckdb.table('sales')`; unqualified `table('sales')` is not valid OntoQL source syntax.

V1 concept stereotypes are:

- `kind`: identity-bearing sortal such as `Customer` or `Store`.
- `event`: occurrence such as `Sale` or `ReturnLine`.
- `situation`: observed state or stateful row such as inventory or line-item state.
- `relator`: relationship object such as a promotion allocation.
- `phase of Parent`: temporal/specialized state of a parent concept.

`identity` declares one or more source-backed key fields. Composite identities are comma-separated. Malloy emission maps a single identity to `primary_key: field`; composite identities lower to `primary_key: concat(field1, '|', field2, ...)`.

## Fields, Joins, and Temporal Axes

`field:` blocks declare source-backed fields:

```ontoql
field:
  store_id :: StoreId
  closed_date :: BusinessDate?
```

`join_one` and `join_many` declare Malloy joins and semantic participation:

```ontoql
join_one customer?: Customer on customer_id
join_many returns: ReturnLine on line_item_id = original_line_item_id
join_one store: Store with store_id
join_cross fiscal_calendar: FiscalCalendar
```

The `?` marker means participation is optional. It is semantic metadata; Malloy emission still uses the appropriate join kind.
`with` joins use Malloy's foreign-key shorthand and require the target concept to have an identity when the target is known.

Temporal axes give business time description:

```ontoql
occurrence_time: sold_at
valid_time: period(valid_from, valid_to)
observation_time: snapshot_date
```

A temporal join may use `at expression` when the target has `valid_time`:

```ontoql
join_one product_at_sale: ProductSKUVersion
  on sku_id = product_at_sale.sku_id
  at sale.sold_at
```

If the target valid time is `period(start, end)`, this lowers to `expression >= target.start and expression < target.end`.

## Roles

Roles are named predicates over a concept:

```ontoql
role LoyaltyCustomer when loyalty_member_id is not null
```

Roles are usable in expressions:

```ontoql
customer is LoyaltyCustomer
```

During Malloy emission, role tests lower to their predicates with the correct path prefix. A join target may name a role; V1 resolves it to the role's base concept and applies the role predicate as part of validation and expression lowering.

## Dimensions, Measures, Views, and Queries

OntoQL preserves Malloy's declaration shape:

```ontoql
dimension:
  margin_amount is net_sales_amount - merchandise_cost_amount

measure:
  net_sales is sum(net_sales_amount)

view: sales_by_region_category is {
  group_by:
    sold_month
    sale.store.region
  aggregate:
    net_sales
}
```

Queries target concepts rather than physical sources:

```ontoql
query: monthly_margin_and_returns is SaleLine -> {
  where: net_sales_amount is not null
  group_by:
    sold_month
  aggregate:
    net_sales
  having: net_sales > 0
  nest:
    loyalty_margin_mix
  index:
    sold_month
  order_by:
    sold_month desc
  limit: 12
}
```

`aggregate:` entries may be named query-local aliases:

```ontoql
max_possible_unique_customers is identified_customers + unrecognized_cash_sales
```

Aliases may reference visible measures, aggregate functions, and earlier aggregate aliases. Raw row-level fields must appear inside aggregate functions.

Query and view bodies support the Malloy clauses `where:`, `select:`/`project:`, `group_by:`, `aggregate:`, `having:`, `calculate:`, `nest:`, `index:`, `order_by:`, and `limit:`/`top:`. `select:` creates projection-style views and queries. `project:` is accepted for Malloy compatibility and emitted as `select:`. `calculate:` is passed through as Malloy analytic/window calculation syntax after expression validation.

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

## Lenses

A lens is a query-time semantic overlay:

```ontoql
lens: western_region is {
  refine: Store extend {
    where: region = 'West'
  }
}
```

Lenses can compose:

```ontoql
lens: western_margin_operations is western_region, margin_operations extend {
  refine: SaleLine extend { ... }
}
```

A query applies lenses with `with`:

```ontoql
query: western_margin is SaleLine with western_region -> { ... }
```

V1 lens application copies the semantic model for the query, applies lenses left-to-right, merges `refine: X extend { ... }` members into concept `X`, and treats `where:` refinements as source filters. Multiple filters compose by conjunction.

## Malloy Lowering

Source expressions emit in Malloy's connection-qualified form:

```malloy
source: retail_line_items is duckdb.table('retail_line_items') extend { ... }
```

SQL sources emit as `connection.sql("""...""")`, named source references emit by name, and concepts backed by queries are emitted after the query declaration they reference. The compiler may emit semantically equivalent Malloy rather than byte-for-byte matching hand-written fixtures.

Semantic-only constructs lower as follows:

- Concept source -> Malloy `source`.
- Identity -> `primary_key`.
- Field declarations -> source columns are assumed to exist; only derived fields emit.
- Role -> predicate substitution for `is Role`.
- Temporal `at` -> period containment predicate.
- Lens `where` -> source/query `where` clauses.
- Semantic type formatting -> Malloy annotations where supported.

## Diagnostics

The compiler must report line/column diagnostics for parse errors and semantic diagnostics for:

- Duplicate types, concepts, roles, joins, measures, dimensions, views, queries, and lenses.
- Unresolved type, concept, role, lens, join path, and field references.
- Include cycles.
- Temporal joins targeting concepts without valid time.
- Invalid lens refinements.
- Aggregate aliases that reference unknown or raw row-level fields outside aggregate functions.
