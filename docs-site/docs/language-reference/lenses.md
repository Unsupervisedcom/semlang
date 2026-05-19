---
title: Lenses
sidebar_position: 5
---

A lens is a query-time semantic overlay. Lenses let a query refine concepts without changing the base semantic model.

```ontoql
lens: western_region is {
  refine: Store extend {
    where: region = 'West'
  }
}
```

Queries apply lenses with `with`:

```ontoql
query: western_margin is SaleLine with western_region -> {
  group_by:
    sold_month
  aggregate:
    net_sales
}
```

## Refinements

A refinement merges additional concept members into an existing concept:

```ontoql
refine: SaleLine extend {
  where: net_sales_amount > 0

  measure:
    profitable_lines is count()
}
```

Refinements can add fields, joins, roles, dimensions, measures, views, validations, temporal axes, identities, and `where` filters according to the same syntax used in concept bodies.

## Composition

Lenses can compose by listing parent lenses before `extend`:

```ontoql
lens: western_margin_operations is western_region, margin_operations extend {
  refine: SaleLine extend {
    where: margin_amount is not null
  }
}
```

V1 applies lenses left-to-right. The compiler copies the semantic model for the query, applies each lens, and merges each `refine: X extend { ... }` block into concept `X`.

## Filters

`where:` refinements become source or query filters. Multiple filters compose by conjunction:

```ontoql
lens: active_western_stores is western_region extend {
  refine: Store extend {
    where: closed_date is null
  }
}
```

Applying `active_western_stores` includes both the inherited western-region filter and the active-store filter.

## Lens-Local Types

Lenses can declare additional semantic types:

```ontoql
lens: margin_operations is {
  type: MarginBand is string {
    allowed_values: ["negative", "low", "healthy"]
  }
}
```

Lens-local types are applied to the query model created for the lens application.
