# REQ-04-ANALYTICS-LENSES: Expressions, Views, Queries, and Lenses

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern expression preservation and validation, dimensions, measures, view/query bodies, aggregate aliases, and query-time lens overlays.

## 04.01 Expressions and Typed Names

SemLang expressions stay close to Malloy expressions. The compiler validates semantic references while preserving accepted expression text where possible.

- 04.01.001: Field-like typed names MUST use `name :: Type`.
- 04.01.002: Typed names MAY use a trailing `?` to mark nullability.
- 04.01.003: Typed names MAY appear in identities, fields, dimensions, and measures where their declaration form allows it.
- 04.01.004: Definitions MUST use `name is expression`.
- 04.01.005: Definitions MAY wrap onto continuation lines.
- 04.01.006: Accepted row-level and aggregate expressions SHOULD be emitted unchanged except where semantic lowering is required.
- 04.01.007: The compiler MUST validate referenced paths in expressions where the owning semantic context is known.

## 04.02 Dimensions and Measures

Dimensions and measures are Malloy-shaped analytical members attached to concepts or refinements.

- 04.02.001: A dimension declaration MUST have a name and expression.
- 04.02.002: A measure declaration MUST have a name and expression.
- 04.02.003: Dimensions and measures MAY include an optional semantic type annotation.
- 04.02.004: Dimension and measure type annotations MUST resolve according to `REQ-01-TYPES.md`.
- 04.02.005: Dimension and measure expressions MUST be validated against the owning concept.
- 04.02.006: Derived dimensions and measures MUST lower to Malloy definitions on the emitted source.

## 04.03 Query and View Bodies

Views and queries share a Malloy-shaped body model. Query bodies should stay close enough to Malloy that emitted queries remain predictable.

- 04.03.001: A view MUST be declared inside a concept or refinement.
- 04.03.002: A view MUST have a name and query body.
- 04.03.003: A query MUST have a name and root concept.
- 04.03.004: A query MAY target a named view on its root concept.
- 04.03.005: The compiler MUST report a diagnostic when a query targets an unknown root concept.
- 04.03.006: The compiler MUST report a diagnostic when a query targets an unknown view.
- 04.03.007: Query and view bodies MUST support `where`, `select`, `project`, `group_by`, `aggregate`, `having`, `calculate`, `nest`, `index`, `order_by`, and `limit`/`top` where valid.
- 04.03.008: `project` MUST be accepted as a compatibility spelling and emitted as `select`.
- 04.03.009: `top` MUST be accepted as a compatibility spelling and represented as a limit.
- 04.03.010: `limit` values MUST be integer row counts.
- 04.03.011: `order_by` items MAY include `asc` or `desc`.
- 04.03.012: Query lowering MUST resolve the root concept to the generated Malloy source name.
- 04.03.013: Query and view bodies SHOULD preserve accepted Malloy-shaped clauses in emission.
- 04.03.014: V1 `index` support is limited to simple expression or alias items in an `index:` section; richer Malloy index forms MUST be rejected or passed through only under an explicit future requirement.
- 04.03.015: A named `nest` item that references a view MUST resolve the view on the query root concept after any query lenses have been applied.
- 04.03.016: An inline `nest` body MUST validate against the same root concept context as the containing query or view body.
- 04.03.017: If a future query stage changes the validation context for nested bodies, that stage-specific context MUST be specified before implementation.

## 04.04 Query Items and Aggregate Aliases

Query item validation protects aggregate correctness while allowing useful query-local aliases.

- 04.04.001: `select`, `group_by`, `aggregate`, `calculate`, `index`, and `order_by` sections MUST contain expressions or aliases.
- 04.04.002: Aggregate entries MAY define query-local aliases.
- 04.04.003: Aggregate aliases MAY reference visible measures.
- 04.04.004: Aggregate aliases MAY reference aggregate functions.
- 04.04.005: Aggregate aliases MAY reference earlier aggregate aliases in the same aggregate section.
- 04.04.006: Aggregate aliases MUST NOT reference raw row-level fields outside aggregate functions.
- 04.04.007: The compiler MUST report aggregate aliases that reference unknown fields.
- 04.04.008: The compiler MUST report aggregate aliases that reference raw row-level fields outside aggregate functions.
- 04.04.009: Aggregate aliases MUST NOT reference later aliases in the same aggregate section.
- 04.04.010: Aggregate aliases MUST NOT reference themselves.
- 04.04.011: The compiler SHOULD report forward alias references and self references with diagnostics that distinguish them from unknown fields when possible.

## 04.05 Filters and Malloy Filter Forms

Filters can appear on concepts, lenses, views, and queries. Malloy filter syntax is preserved while semantic paths are validated.

- 04.05.001: Filters MAY be written as single-line `where:` clauses.
- 04.05.002: Filters MAY be written as section-style `where:` clauses.
- 04.05.003: `having:` clauses MUST be validated in aggregate context.
- 04.05.004: Malloy filter forms using `?` alternation MUST be validated for referenced paths and emitted unchanged.
- 04.05.005: Malloy range filters using `to` MUST be validated for referenced paths and emitted unchanged.
- 04.05.006: Malloy regex and string matching filters using `~` and `!~` MUST be validated for referenced paths and emitted unchanged.
- 04.05.007: Malloy filter strings such as `f'this week'` MUST be emitted unchanged when accepted.

## 04.06 Lenses

Lenses are query-time overlays. They refine a copied query model without changing the base semantic model.

- 04.06.001: A lens declaration MUST have a name and body.
- 04.06.002: A lens MAY declare parent lenses before `extend`.
- 04.06.003: Parent lenses MUST resolve to existing lenses.
- 04.06.004: V1 lens application MUST apply parent and named lenses left-to-right.
- 04.06.005: Applying lenses to a query MUST copy the semantic model for that query.
- 04.06.006: Applying lenses to a query MUST NOT mutate the base semantic model.
- 04.06.007: A query MAY apply one or more lenses using `with`.
- 04.06.008: Query lens names MUST resolve to existing lenses.
- 04.06.009: When a query applies lenses and targets a named view, the compiler MUST apply lenses before resolving the named view.
- 04.06.010: Lens refinements MAY add views that are visible to view resolution for the lens-applied query model.
- 04.06.011: If a lens refinement defines a view with the same name as an existing view on the refined concept, the compiler MUST either define deterministic replacement semantics or report a duplicate view diagnostic.
- 04.06.012: When a query applies lenses, emitted query-local sources MUST use the lens-expanded concept graph for both the query root and joined concepts.
- 04.06.013: Measures on a lensed query root that aggregate through joins MUST resolve those joins to lens-expanded sources, so filters on non-root grains are applied before the root-grain aggregation.

## 04.07 Refinements and Lens-Local Types

Refinements merge semantic members into existing concepts for a lens-applied query model.

- 04.07.001: A refinement MUST name an existing concept.
- 04.07.002: The compiler MUST report a diagnostic when a refinement targets an unknown concept.
- 04.07.003: Refinements MAY add fields, joins, roles, dimensions, measures, views, validations, temporal axes, identities, and `where` filters using concept-body syntax.
- 04.07.004: Refinement members MUST be validated after they are merged into the query-specific semantic model.
- 04.07.005: Multiple lens `where` refinements applying to the same concept MUST compose by conjunction.
- 04.07.006: Lens-local types MAY be declared in a lens.
- 04.07.007: Lens-local types MUST be available in the query model created for lens application.
- 04.07.008: A lens `where` refinement on a non-root concept MUST be preserved as a filter on that concept in the lens-expanded query model.
