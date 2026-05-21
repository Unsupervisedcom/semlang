# SemLang V1 Language Specification

SemLang is a semantic modeling language that stays close to Malloy so it can be compiled into Malloy for query execution. It adds an ontology layer inspired by gUFO and OntoUML: business concepts, roles, relators, situations, temporal axes, and validation predicates live beside the analytical model instead of in a separate diagram.

V1 is defined by the retail SemLang examples in `examples/retail-omnichannel-margin-and-returns` and by the recurring Malloy patterns in the banking, healthcare, manufacturing, retail, and SaaS examples. The compiler is intentionally conservative: every accepted construct must lower to deterministic Malloy or produce diagnostics.

## Packages and Includes

A SemLang file starts with one package declaration:

```semlang
package retail.omnichannel_margin_returns
```

Files may include other SemLang files by relative path:

```semlang
include "./example.semlang"
```

Includes are loaded before the including file is resolved. Include cycles are invalid.

## Semantic Types

Semantic types are named value domains over primitive Malloy-compatible values:

```semlang
type: Dollars is currency {
  scale_type: ratio
  currency: "USD"
  render_format: currency("USD", 2)
}
```

V1 primitive bases are `string`, `number`, `date`, `timestamp`, `currency`, and `boolean`. Type bodies are metadata maps. Recognized JSON Schema-style metadata includes `description`, `enum`, `const`, `default`, `examples`, numeric and string bounds, `pattern`, and `format`. SemLang-specific metadata includes `scale_type`, `identifies`, `identifies_role`, `currency`, `unit`, and `render_format`. Unknown metadata is preserved in the AST and semantic model but does not affect Malloy emission.

Field annotations use Malloy-like `::` syntax. A trailing `?` marks nullable values:

```semlang
customer_id :: CustomerId?
```

## Sources and Concepts

A concept declares an ontological classifier and the Malloy source expression that backs it:

```semlang
concept SaleLine is situation from duckdb.table('retail_line_items') {
  identity line_item_id :: SaleLineId
}
```

The `from` clause follows Malloy source semantics. It can reference a table or view through a named connection, a SQL source, a named source, a concept source, or a query result:

```semlang
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

Use explicit connection names such as `duckdb.table('sales')`; unqualified `table('sales')` is not valid SemLang source syntax.

Top-level `ignored` declarations record source expressions that were reviewed and deliberately excluded from the ontology:

```semlang
ignored duckdb.table('staging_customer_raw') {
  reason: "Staging table; canonical data lives in dim_customer"
}
```

`reason` is required. Ignored declarations are metadata only: they do not produce concepts, fields, sources, queries, or any Malloy output. Tooling can read them from the resolved semantic model and JSON Schema metadata to distinguish deliberately excluded tables from tables that have not yet been modeled.

V1 concept stereotypes are:

- `kind`: identity-bearing sortal such as `Customer` or `Store`.
- `event`: occurrence such as `Sale` or `ReturnLine`.
- `situation`: observed state or stateful row such as inventory or line-item state.
- `relator`: relationship object such as a promotion allocation.
- `phase of Parent`: temporal/specialized state of a parent concept.

`identity` declares one or more source-backed key fields. Composite identities are comma-separated. Malloy emission maps a single identity to `primary_key: field`; composite identities lower through a deterministic generated dimension, with `primary_key:` pointing at that generated field.

## Fields, Joins, and Temporal Axes

`field:` blocks declare source-backed fields:

```semlang
field:
  store_id :: StoreId
  closed_date :: BusinessDate?
```

`join_one` and `join_many` declare Malloy joins and semantic participation:

```semlang
join_one customer?: Customer on customer_id
join_many returns: ReturnLine on line_item_id = original_line_item_id
join_one store: Store with store_id
join_one profile: duckdb.table('customer_profiles') on customer_id = profile.customer_id
join_cross fiscal_calendar: FiscalCalendar
```

The `?` marker means participation is optional. It is semantic metadata; Malloy emission still uses the appropriate join kind.
`with` joins use Malloy's foreign-key shorthand and require the target concept to have an identity when the target is known.
When a one-to-one auxiliary table should enrich a concept without changing the concept's master row population, `join_one` may target an inline named-connection source expression. This mirrors Malloy source-extension syntax and keeps the primary `from` source as the concept's master list.
Inline filters are not part of `join_one` syntax. To filter an auxiliary source before joining it, declare a named source query:

```semlang
source: active_profiles is duckdb.table('customer_profiles') -> {
  where: is_active
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: CustomerId
  join_one profile: active_profiles on customer_id = profile.customer_id
}
```

Alternatively, use a SQL source when the filter belongs in SQL:

```semlang
concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: CustomerId
  join_one profile: duckdb.sql("""select * from customer_profiles where is_active""")
    on customer_id = profile.customer_id
}
```

Temporal axes give business time description:

```semlang
occurrence_time: sold_at
valid_time: period(valid_from, valid_to)
observation_time: snapshot_date
```

A temporal join may use `at expression` when the target has `valid_time`:

```semlang
join_one product_at_sale: ProductSKUVersion
  on sku_id = product_at_sale.sku_id
  at sale.sold_at
```

If the target valid time is `period(start, end)`, this lowers to `expression >= target.start and expression < target.end`.

## Roles

Roles are named predicates over a concept:

```semlang
role Loyalty when loyalty_member_id is not null {
  label: "Loyalty Customer"
  aliases: "Rewards Customer", "Member Customer"
}
```

Roles are usable in expressions:

```semlang
customer is Customer.Loyalty
```

The canonical role name is the owning concept plus the local role name, such as `Customer.Loyalty`. Bare role names are also accepted when the tested path identifies the owning concept, such as `customer is Loyalty` when `customer` joins to `Customer`. If a bare role name is ambiguous, use the qualified form.

Role `label` and `aliases` metadata support discovery and presentation. Array-valued metadata may use either bracketed literals or top-level comma-separated values, so `aliases: ["Rewards Customer", "Member Customer"]` and `aliases: "Rewards Customer", "Member Customer"` are equivalent.

During Malloy emission, role tests lower to their predicates with the correct path prefix. A join target may name a role, including a qualified role such as `Customer.Loyalty`; V1 resolves it to the role's base concept and applies the role predicate as part of validation and expression lowering.

## Dimensions, Measures, Views, and Queries

SemLang preserves Malloy's declaration shape:

```semlang
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

```semlang
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

```semlang
max_possible_unique_customers is identified_customers + unrecognized_cash_sales
```

Aliases may reference visible measures, aggregate functions, and earlier aggregate aliases. Raw row-level fields must appear inside aggregate functions.

Query and view bodies support the Malloy clauses `where:`, `select:`/`project:`, `group_by:`, `aggregate:`, `having:`, `calculate:`, `nest:`, `index:`, `order_by:`, and `limit:`/`top:`. `select:` creates projection-style views and queries. `project:` is accepted for Malloy compatibility and emitted as `select:`. `calculate:` is passed through as Malloy analytic/window calculation syntax after expression validation.

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

## Lenses

A lens is a query-time semantic overlay:

```semlang
lens: western_region is {
  refine: Store extend {
    where: region = 'West'
  }
}
```

Lenses can compose:

```semlang
lens: western_margin_operations is western_region, margin_operations extend {
  refine: SaleLine extend { ... }
}
```

A query applies lenses with `with`:

```semlang
query: western_margin is SaleLine with western_region -> { ... }
```

V1 lens application copies the semantic model for the query, applies lenses left-to-right, merges `refine: X extend { ... }` members into concept `X`, and treats `where:` refinements as source filters. Multiple filters compose by conjunction.

Lens filters are not limited to the query root. They apply to the query-local
concept graph before the query body is lowered, so a root-grain query can
aggregate through a filtered joined grain.

```semlang
concept ProductSKU is kind from duckdb.table('products') {
  identity product_id :: string
  field:
    brand :: string
}

concept SaleLine is event from duckdb.table('sale_lines') {
  identity line_id :: string
  field:
    customer_id :: string
    product_id :: string
    net_sales_amount :: number
  join_one product: ProductSKU on product_id
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  field:
    age :: number
  join_many sale_lines: SaleLine on customer_id
  measure:
    apple_product_spend is sale_lines.sum(net_sales_amount)
}

lens: apple_products is {
  refine: ProductSKU extend {
    where: brand = 'Apple'
  }

  refine: SaleLine extend {
    where: product.brand = 'Apple'
  }
}

lens: young_adult_customers is {
  refine: Customer extend {
    where: age >= 18 and age <= 25
  }
}

query: young_adult_apple_value is Customer with apple_products, young_adult_customers -> {
  group_by:
    customer_id
  aggregate:
    apple_product_spend
}
```

This query is rooted at `Customer`, but `apple_product_spend` aggregates through
`sale_lines`. With the lenses applied, the generated customer source joins the
query-local `SaleLine` source, and that `SaleLine` source carries the Apple
filter. The young-adult filter applies at the customer source at the same time.
The base model remains unchanged for other queries.

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
- Lens `where` -> query-local source filters on the refined concepts.
- Semantic type formatting -> Malloy annotations where supported.

## Diagnostics

The compiler must report line/column diagnostics for parse errors and semantic diagnostics for:

- Duplicate types, concepts, roles, joins, measures, dimensions, views, queries, and lenses.
- Unresolved type, concept, role, lens, join path, and field references.
- Include cycles.
- Temporal joins targeting concepts without valid time.
- Invalid lens refinements.
- Aggregate aliases that reference unknown or raw row-level fields outside aggregate functions.
