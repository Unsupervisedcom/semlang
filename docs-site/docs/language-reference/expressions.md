---
title: Expressions
sidebar_position: 5
---

SemLang expressions intentionally stay close to Malloy expressions. The compiler preserves row-level and aggregate expressions where possible, while adding semantic lowering for role tests, temporal joins, lenses, and query aliases.

## Typed Names

Field-like declarations use `name :: Type`:

```semlang
customer_id :: CustomerId
closed_date :: BusinessDate?
```

The trailing `?` marks a nullable value. Typed names appear in identities, fields, and optional type annotations on dimensions and measures.

## Definitions

Dimensions and measures use `name is expression`:

```semlang
dimension:
  margin_amount is net_sales_amount - merchandise_cost_amount

measure:
  net_sales is sum(net_sales_amount)
```

Definitions can wrap onto continuation lines when the expression is long.

## Role Tests

Roles are tested with `is RoleName` or the qualified `is Concept.RoleName` form:

```semlang
role Loyalty when loyalty_member_id is not null

dimension:
  loyalty_segment is case when customer is Customer.Loyalty then 'Loyalty' else 'Other' end
```

During lowering, the role test is replaced by the role predicate. If the test uses a path such as `customer is Customer.Loyalty`, field references inside the predicate are prefixed with that path. Bare role names can be used when the tested path identifies the owning concept, such as `customer is Loyalty`.

## Join Conditions

Join conditions follow the `on` keyword:

```semlang
join_one store: Store on store_id
join_many returns: ReturnLine on line_item_id = original_line_item_id
```

If the condition is a single field name, lowering treats it as equality between the source field and the same field on the join target. Explicit equality conditions can name source and target fields directly.

Temporal joins can add `at expression`:

```semlang
join_one product_at_sale: ProductSKUVersion
  on sku_id = product_at_sale.sku_id
  at sold_at
```

The `at` expression only applies when the target concept has a `valid_time` period.

## Filters

Concepts, lenses, views, and queries can use `where:` filters:

```semlang
where: region = 'West'
```

Filters can also be written as a section:

```semlang
where:
  region = 'West'
  and opened_date is not null
```

Lens filters compose by conjunction when multiple lenses or refinements apply.

## Query Items and Aliases

`select:`, `group_by:`, `aggregate:`, `calculate:`, and `order_by:` sections contain expressions. Aggregate entries may define query-local aliases:

```semlang
aggregate:
  identified_customers is count(customer_id)
  max_possible_unique_customers is identified_customers + unrecognized_cash_sales
```

Aliases may reference visible measures, aggregate functions, and earlier aggregate aliases. Raw row-level fields must appear inside aggregate functions.

`order_by:` items may include `asc` or `desc` after the expression. `limit:` accepts an integer row count.

Malloy filter forms such as `status ? 'new' | 'open'`, ranges with `to`, regex/string matching with `~` and `!~`, and filter strings such as `f'this week'` are validated for referenced paths and emitted unchanged.
