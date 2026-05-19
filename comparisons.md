# OntoQL Syntax Comparisons

These examples use the compact OntoQL style: concepts declare their source table directly, fields use Malloy-like `::` type annotations, constrained value sets live on `type:` declarations, temporal meaning is expressed through explicit time axes, named validations use executable predicates, and optional lenses can refine semantic concepts at query time.

## OntoQL vs. OntoUML

- **Concept declarations are textual and source-adjacent**
  OntoUML usually represents a concept as a diagram class with a stereotype. OntoQL writes the concept in text and can attach its source table in the same declaration.
  ```uml
  <<kind>> Customer
  ```
  ```ontoql
  concept Customer is kind from table('customers') {
    identity customer_id :: CustomerId
  }
  ```

- **Stereotypes are declaration keywords**
  OntoUML uses stereotype brackets. OntoQL makes the stereotype part of the declaration grammar.
  ```uml
  <<event>> Sale
  <<relator>> PromotionAllocation
  <<situation>> InventoryPosition
  ```
  ```ontoql
  concept Sale is event from table('transactions') { ... }
  concept PromotionAllocation is relator from table('line_item_promotions') { ... }
  concept InventoryPosition is situation from table('inventory_snapshots') { ... }
  ```

- **Roles are inline `role ... when ...` predicates**
  OntoUML commonly models a role as a separate stereotyped class plus a constraint. OntoQL can declare the source-backed fields on the base concept, then define the role as a classification over those fields.
  ```uml
  <<role>> LoyaltyCustomer --|> Customer
  context LoyaltyCustomer
  inv: self.loyaltyMemberId <> null
  ```
  ```ontoql
  concept Customer is kind from table('customers') {
    field:
      loyalty_member_id :: LoyaltyMemberId? unique

    role LoyaltyCustomer when loyalty_member_id is not null
  }
  ```

- **Identity fields are explicit**
  OntoUML identity is often implied by kind/sortal structure. OntoQL spells out the source-backed identity field.
  ```uml
  <<kind>> Store
  ```
  ```ontoql
  concept Store is kind from table('stores') {
    identity store_id :: StoreId
  }
  ```

- **Attributes use field blocks with Malloy-like type annotations**
  OntoUML uses UML attribute notation. OntoQL keeps fields in blocks but uses `::` annotations for scalar and semantic types.
  ```uml
  Customer
  + householdId : String [0..1]
  + paymentCardHash : String [0..1]
  ```
  ```ontoql
  concept Customer is kind from table('customers') {
    field:
      household_id :: string?
      payment_card_hash :: string?
  }
  ```

- **Associations are joins**
  OntoUML associations are diagram edges. OntoQL writes the association as a named join, including optionality.
  ```uml
  Sale "0..*" --> "0..1" Customer : customer
  ```
  ```ontoql
  concept Sale is event from table('transactions') {
    join_one customer?: Customer on customer_id
  }
  ```

- **Temporal semantics use explicit time axes**
  OntoUML can model phases and temporal constraints through classes and constraints. OntoQL names the relevant time axis directly.
  ```uml
  <<phase>> ProductSKUVersion --|> ProductSKU
  validFrom : Date
  validTo : Date
  ```
  ```ontoql
  concept ProductSKUVersion is phase of ProductSKU from table('product_sku_history') {
    field:
      sku_id :: SKUId

    valid_time: period(valid_from, valid_to)
  }
  ```

- **Temporal joins can target a valid-time axis**
  Malloy spells out effective-dated join predicates. OntoQL can keep the key predicate and use `at` to join to the version whose `valid_time` contains that expression.
  ```malloy
  join_one: product_at_sale is product_sku_history
    on sku_id = product_at_sale.sku_id
    and sold_at >= product_at_sale.valid_from
    and sold_at < product_at_sale.valid_to
  ```
  ```ontoql
  join_one product_at_sale: ProductSKUVersion
    on sku_id = product_at_sale.sku_id
    at sale.sold_at
  ```

- **Phase declarations imply their parent relation**
  OntoUML specialization already connects a phase to its base sortal. OntoQL follows that pattern: `phase of ProductSKU` defines the parent concept relation, while fields such as `sku_id` provide the source-backed key used to compile it.
  ```uml
  <<phase>> ProductSKUVersion --|> ProductSKU
  ```
  ```ontoql
  concept ProductSKUVersion is phase of ProductSKU from table('product_sku_history') {
    field:
      sku_id :: SKUId
  }
  ```

- **Derived values use query expressions**
  OntoUML may use derived properties or OCL. OntoQL writes the derivation in expression syntax.
  ```uml
  /marginAmount : Dollars
  context SaleLine
  derive: netSalesAmount - merchandiseCostAmount
  ```
  ```ontoql
  dimension:
    margin_amount is net_sales_amount - merchandise_cost_amount
  ```

- **Invariants become named validation predicates**
  OntoUML commonly writes constraints in OCL. OntoQL keeps the rule near the concept, but gives it a stable name, description, and executable predicate; a false predicate is a validation error.
  ```ocl
  context Store
  inv ClosedAfterOpened:
    self.closedDate = null or self.closedDate >= self.openedDate
  ```
  ```ontoql
  validation:
    closed_after_opened is {
      description: "A store cannot close before it opens."
      predicate: closed_date is null or closed_date >= opened_date
    }
  ```

## OntoQL vs. Malloy

- **Concept and source can be one declaration**
  Malloy starts with a source. OntoQL starts with a concept, but can attach the source table directly.
  ```malloy
  source: customers is table('customers') extend {
    primary_key: customer_id
  }
  ```
  ```ontoql
  concept Customer is kind from table('customers') {
    identity customer_id :: CustomerId
  }
  ```

- **Fields are typed semantic fields, not just source fields**
  Malloy usually leaves table columns implicit unless defining dimensions. OntoQL can declare source-backed fields and their semantic types.
  ```malloy
  source: customers is table('customers') extend {
    dimension:
      is_loyalty_customer is loyalty_member_id is not null
  }
  ```
  ```ontoql
  concept Customer is kind from table('customers') {
    field:
      loyalty_member_id :: LoyaltyMemberId? unique

    role LoyaltyCustomer when loyalty_member_id is not null
  }
  ```

- **Named types can carry semantic metadata**
  Malloy's type-oriented syntax is about the value shape. OntoQL keeps the Malloy-like `type:` and `::` syntax, then adds metadata such as scale type, identity target, and render format.
  ```malloy
  type: money_fields is {
    net_sales_amount :: number
  }
  ```
  ```ontoql
  type: Dollars is currency {
    scale_type: ratio
    currency: "USD"
    render_format: currency("USD", 2)
  }

  field:
    net_sales_amount :: Dollars
  ```

- **Format metadata is function-shaped, not embedded annotations**
  Malloy formatting is emitted as annotations. OntoQL stores formatting as lexer-friendly metadata and leaves target-specific annotation syntax to the emitter.
  ```malloy
  measure:
    # currency=usd2
    net_sales is sum(net_sales_amount)
  ```
  ```ontoql
  type: Dollars is currency {
    currency: "USD"
    render_format: currency("USD", 2)
  }
  ```

- **Joins carry semantic participant names**
  Malloy joins establish table navigation. OntoQL joins also declare participation in the concept model.
  ```malloy
  join_one: customer is customers
    on customer_id = customer.customer_id
  ```
  ```ontoql
  join_one customer?: Customer on customer_id
  ```

- **Aggregate paths stay function-shaped**
  Malloy commonly aggregates over joined paths. OntoQL keeps that familiar shape, while the semantic concept supplies the meaning of the path.
  ```malloy
  measure:
    promotion_discount is sum(promotion_allocations.allocation_amount)
  ```
  ```ontoql
  measure:
    promotion_discount is sum(promotion_allocations.allocation_amount)
  ```

- **Role predicates replace repeated boolean expressions**
  Malloy writes the underlying condition. OntoQL lets queries and dimensions use the role name.
  ```malloy
  dimension:
    customer_recognition_method is case
      when customer.loyalty_member_id is not null then 'loyalty'
    end
  ```
  ```ontoql
  dimension:
    customer_recognition_method is case
      when customer is LoyaltyCustomer then 'loyalty'
    end
  ```

- **Event occurrence time is a first-class marker**
  Malloy can derive dates from timestamps. OntoQL marks the event timestamp directly.
  ```malloy
  dimension:
    sold_date is sold_at.date
  ```
  ```ontoql
  concept Sale is event from table('transactions') {
    occurrence_time: sold_at
    dimension:
      sold_date is sold_at.date
  }
  ```

- **Situation time is separate from event time**
  Malloy treats snapshot dates as regular fields. OntoQL distinguishes when a state is valid from when it was observed.
  ```malloy
  source: inventory_snapshots is table('inventory_snapshots') extend {
    dimension:
      available_to_sell_units is on_hand_units - reserved_units - damaged_units
  }
  ```
  ```ontoql
  concept InventoryPosition is situation from table('inventory_snapshots') {
    valid_time: snapshot_date
    observation_time: snapshot_date
    dimension:
      available_to_sell_units is on_hand_units - reserved_units - damaged_units
  }
  ```

- **Queries keep Malloy's `is ... ->` shape**
  Malloy queries target a source. OntoQL keeps the same query form, but the target is a semantic concept whose source is already known from `from table(...)`.
  ```malloy
  query: monthly_margin_and_returns is retail_line_items -> {
    aggregate: net_sales
  }
  ```
  ```ontoql
  query: monthly_margin_and_returns is SaleLine -> {
    aggregate: net_sales
  }
  ```

- **Inline aggregate aliases are query-local generated measures**
  Malloy measures usually live on a source. OntoQL allows `alias is expression` inside `aggregate:` for ad hoc analytical answers; the compiler treats it as a generated measure on the temporary query source, and the expression can reference visible measures or earlier aggregate aliases.
  ```malloy
  source: denver_customer_count_query is transactions extend {
    measure:
      max_possible_unique_customers is identified_customers + unrecognized_cash_sales
  }

  query: denver_customer_count is denver_customer_count_query -> {
    aggregate: max_possible_unique_customers
  }
  ```
  ```ontoql
  query: denver_customer_count is Sale -> {
    aggregate:
      identified_customers
      unrecognized_cash_sales

      max_possible_unique_customers is
        identified_customers + unrecognized_cash_sales
  }
  ```

- **Lenses are query-time semantic overlays**
  Malloy extends sources by creating a new source name. OntoQL lenses refine existing semantic concepts and are applied explicitly in the query.
  ```malloy
  source: western_line_items is retail_line_items extend {
    where: store.region = 'West'
  }

  query: western_margin is western_line_items -> {
    aggregate: net_sales
  }
  ```
  ```ontoql
  lens: western_region is {
    refine: SaleLine extend {
      where: sale.store.region = 'West'
    }
  }

  query: western_margin is SaleLine with western_region -> {
    aggregate: net_sales
  }
  ```

- **Lenses can compose without creating a new source**
  Malloy composition typically happens by extending one named source from another. OntoQL composes lens overlays after the concept model is loaded, leaving the concept name stable.
  ```malloy
  source: western_margin_line_items is western_line_items extend {
    dimension:
      margin_risk_band is case when margin_amount < 0 then 'intervene' else 'healthy' end
  }
  ```
  ```ontoql
  lens: western_margin_operations is western_region, margin_operations extend {
    refine: SaleLine extend {
      view: western_margin_risk_by_category is {
        group_by: margin_risk_band
        aggregate: net_sales
      }
    }
  }
  ```

- **Constrained types replace enum declarations**
  Malloy usually compares against literal strings. OntoQL can keep that literal syntax while declaring allowed values on the field type.
  ```malloy
  where: return_status = 'settled'
  ```
  ```ontoql
  type: ReturnStatus is string {
    scale_type: ordinal
    enum: ['authorized', 'received', 'accepted', 'rejected', 'settled']
  }

  where: return_status = 'settled'
  ```

- **Validations are executable predicates with error semantics**
  Malloy predicates usually filter result sets. OntoQL validation predicates use the same expression style, but false rows are reported as data-quality errors instead of being excluded from an analytical result.
  ```malloy
  query: invalid_settled_returns is return_lines -> {
    where:
      return_status = 'settled'
      and settled_at is null
  }
  ```
  ```ontoql
  validation:
    settled_returns_have_settlement_time is {
      description: "A settled return must have a settlement timestamp."
      predicate: return_status != 'settled' or settled_at is not null
    }
  ```

- **Optional joins are syntactic**
  Malloy optionality is implied by join behavior and nullable keys. OntoQL exposes optional semantic participation with `?`.
  ```malloy
  join_one: customer is customers
    on customer_id = customer.customer_id
  ```
  ```ontoql
  join_one customer?: Customer on customer_id
  ```

- **Agent traces are comments around semantic queries**
  Malloy comments explain query logic. OntoQL examples use comments to show semantic discovery, validation, and reasoning steps.
  ```malloy
  // Sales by month and category.
  query: sales_by_month is retail_line_items -> { ... }
  ```
  ```ontoql
  // mcp.semantic.search_terms({ question: "sales by month and category" })
  // -> concepts: SaleLine, Sale, ProductSKUVersion
  query: sales_by_month is SaleLine -> { ... }
  ```
