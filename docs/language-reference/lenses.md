---
title: Lenses
sidebar_position: 6
---

A lens is a query-time semantic overlay.
Lenses let a query refine concepts without changing the base semantic model.

```semlang
lens: western_region is {
  refine: Store extend {
    where: region = 'West'
  }
}
```

Queries apply lenses with `with`:

```semlang
query: western_margin is SaleLine with western_region -> {
  group_by:
    sold_month
  aggregate:
    net_sales
}
```

## Refinements

A refinement merges additional concept members into an existing concept:

```semlang
refine: SaleLine extend {
  where: net_sales_amount > 0

  measure:
    profitable_lines is count()
}
```

Refinements can add fields, joins, roles, dimensions, measures, views, validations, temporal axes, identities, and `where` filters according to the same syntax used in concept bodies.

## Composition

Lenses can compose by listing parent lenses before `extend`:

```semlang
lens: western_margin_operations is western_region, margin_operations extend {
  refine: SaleLine extend {
    where: margin_amount is not null
  }
}
```

V1 applies lenses left-to-right.
The compiler copies the semantic model for the query, applies each lens, and merges each `refine: X extend { ... }` block into concept `X`.

## Filters

`where:` refinements become query-local source filters on the refined concepts.
Multiple filters compose by conjunction:

```semlang
lens: active_western_stores is western_region extend {
  refine: Store extend {
    where: closed_date is null
  }
}
```

Applying `active_western_stores` includes both the inherited western-region filter and the active-store filter.

## Deep Lens Application

Lens filters apply to the whole query-local concept graph, not only to the query root.
This matters when the query is rooted at one grain but a metric aggregates through a joined grain.

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

The query asks a customer-grain question.
The Apple lens filters the product and sale-line grains, while the young-adult lens filters the customer grain.
During lowering, the compiler emits query-local sources for `Customer`, `SaleLine`, and `ProductSKU`; the customer source joins the lens-expanded sale-line source, and `apple_product_spend` aggregates over that filtered upstream source.

The generated Malloy has this shape:

```malloy
source: sale_lines__young_adult_apple_value is duckdb.table('sale_lines') extend {
  join_one: product is products__young_adult_apple_value
  where: product.brand = 'Apple'
}

source: customers__young_adult_apple_value is duckdb.table('customers') extend {
  join_many: sale_lines is sale_lines__young_adult_apple_value
  where: age >= 18 and age <= 25

  measure:
    apple_product_spend is sale_lines.sum(net_sales_amount)
}

query: young_adult_apple_value is customers__young_adult_apple_value -> {
  group_by:
    customer_id
  aggregate:
    apple_product_spend
}
```

This is the important lens contract: filters from active lenses are applied upstream to the refined concept before root-grain metrics aggregate through that concept.
The base `Customer`, `SaleLine`, and `ProductSKU` sources remain available unchanged for non-lensed queries.

## Lens-Local Types

Lenses can declare additional semantic types:

```semlang
lens: margin_operations is {
  type: MarginBand is string {
    enum: ["negative", "low", "healthy"]
  }
}
```

Lens-local types are applied to the query model created for the lens application.
