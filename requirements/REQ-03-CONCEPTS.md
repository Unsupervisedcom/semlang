# REQ-03-CONCEPTS: Concepts, Members, Joins, Roles, and Time

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern concept declarations and concept-local semantic members: stereotypes, identities, fields, joins, temporal axes, roles, dimensions, measures, views, validations, and filters.

## 03.01 Concept Declarations

Concepts are the main modeling unit. A concept names what a source row means and binds that meaning to a Malloy-compatible source expression.

- 03.01.001: A concept declaration MUST name a concept, a supported stereotype, and a source expression.
- 03.01.002: A concept source expression MUST follow the source-expression requirements in `REQ-02-FILES-SOURCES.md`.
- 03.01.003: The compiler MUST emit each accepted concept as a Malloy source.
- 03.01.004: Concept bodies MAY contain descriptions, identities, temporal axes, fields, joins, roles, dimensions, measures, views, validations, and `where` filters.
- 03.01.005: The compiler MUST reject unexpected concept members.
- 03.01.006: The compiler MUST report duplicate names among identities, fields, joins, roles, dimensions, measures, views, and validations within a concept.
- 03.01.007: Identity and field declarations on the same concept MUST share one namespace; an identity and field with the same name MUST be reported as a duplicate field.
- 03.01.008: Concept descriptions MUST be preserved in the semantic model.
- 03.01.009: Concept descriptions MUST be available to JSON Schema export as the `description` for the exported concept row schema.

## 03.02 Stereotypes

Stereotypes classify concept rows using the ontology layer while keeping emitted Malloy sources ordinary.

- 03.02.001: The compiler MUST accept `kind`, `event`, `situation`, `relator`, and `phase` as concept stereotypes.
- 03.02.002: A `phase` concept MUST identify its parent concept with `phase of Parent`.
- 03.02.003: The compiler MUST preserve the concept stereotype in the semantic model.
- 03.02.004: Concept stereotypes MUST NOT change the physical source expression emitted for the concept unless a later requirement explicitly defines such lowering.

## 03.03 Identity

Identities declare source-backed keys for concepts. They also drive Malloy primary key lowering.

- 03.03.001: An identity declaration MUST contain one or more typed names.
- 03.03.002: Composite identities MUST be expressed as comma-separated typed names.
- 03.03.003: Identity types MUST resolve according to the type resolution requirements in `REQ-01-TYPES.md`.
- 03.03.004: A single identity MUST lower to a Malloy `primary_key` over that field.
- 03.03.005: A composite identity MUST lower to a deterministic generated dimension and a Malloy primary key over that generated field.
- 03.03.006: Identity field locations SHOULD be preserved for diagnostics.
- 03.03.007: Identity fields MAY include a block-level `description`.
- 03.03.008: Identity field descriptions MUST be preserved in the semantic model and exposed by ontology introspection, semantic search, and JSON Schema export.

## 03.04 Fields

Fields declare source-backed attributes and attach semantic types and metadata.

- 03.04.001: A `field:` block MUST contain typed field declarations.
- 03.04.002: Field types MUST resolve according to the type resolution requirements in `REQ-01-TYPES.md`.
- 03.04.003: A trailing `?` on a field type MUST mark the field nullable.
- 03.04.004: A field MAY use the `unique` marker.
- 03.04.005: The compiler MUST preserve field uniqueness metadata in the semantic model.
- 03.04.006: Source-backed field declarations MUST NOT emit derived Malloy field definitions by default.
- 03.04.007: Fields MAY include a block-level `description`.
- 03.04.008: Field descriptions MUST be preserved in the semantic model and exposed by ontology introspection, semantic search, and JSON Schema export.

## 03.05 Joins

Joins declare analytical relationships and semantic participation between concepts or roles.

- 03.05.001: The compiler MUST accept `join_one`, `join_many`, and `join_cross`.
- 03.05.002: `join_one` and `join_many` declarations MUST include either an `on` condition or a `with` condition.
- 03.05.003: `join_cross` MAY omit an `on` condition.
- 03.05.004: `join_cross` MUST NOT use `with`.
- 03.05.005: A `?` marker after the join name MUST mark optional participation metadata.
- 03.05.006: Optional participation metadata MUST NOT by itself change the emitted Malloy join kind.
- 03.05.007: Join targets MUST resolve to a concept, named source, qualified role name, unambiguous role short name, or supported inline source expression.
- 03.05.008: When a join target names a role, the compiler MUST resolve that role to its base concept.
- 03.05.009: `with` joins MUST require a resolvable target identity when the target concept is known.
- 03.05.010: `with` joins MUST validate that the source concept has the named foreign-key field.
- 03.05.011: When a join target names a role, the emitted join MUST apply the role predicate to the joined target rows.
- 03.05.012: A `join_cross` targeting a role MUST lower to a cross join against the role base concept with the role predicate applied as a target-side filter, or the compiler MUST reject the join if it cannot preserve that meaning.
- 03.05.013: A `join_one` target MAY be an inline named-connection source expression such as `duckdb.table('customer_profiles')`.
- 03.05.014: Inline source targets MUST lower as Malloy join targets without changing the owning concept's master source population.
- 03.05.015: `join_many` and `join_cross` MUST NOT target inline source expressions unless a later requirement defines source-target fanout semantics.

## 03.06 Join Conditions and Temporal Joins

Join conditions stay close to Malloy syntax, with additional temporal lowering when a join uses `at`.

- 03.06.001: A single-field `on` condition MUST lower as equality between the source field and the same field on the join target.
- 03.06.002: Explicit equality `on` conditions MAY name source and target fields directly.
- 03.06.003: A join MAY add `at expression` only when the target concept has a `valid_time` temporal axis.
- 03.06.004: A join using `at expression` MUST be a join form whose lowering can include target valid-time containment in the emitted join predicate.
- 03.06.005: A `with` join using `at expression` MUST lower by expanding the foreign-key shorthand into an explicit join predicate and adding valid-time containment.
- 03.06.006: A `join_cross` MUST NOT use `at expression` unless a later requirement defines exact temporal cross-join lowering.
- 03.06.007: The compiler MUST report a diagnostic when `at` targets a concept without valid time.
- 03.06.008: When the target valid time is `period(start, end)`, temporal join lowering MUST add containment predicates equivalent to `expression >= target.start` and `expression < target.end`.

## 03.07 Temporal Axes

Temporal axes give business-time semantics to concepts and support temporal joins.

- 03.07.001: The compiler MUST accept `occurrence_time`, `valid_time`, `observation_time`, and `recorded_time` temporal axes.
- 03.07.002: Temporal axes MUST preserve their expression text in the semantic model.
- 03.07.003: A `valid_time` axis MAY be a single expression.
- 03.07.004: A `valid_time` axis MAY be a `period(start, end)` expression.
- 03.07.005: Temporal axis expressions MUST be validated as expressions against the owning concept where possible.

## 03.08 Roles

Roles name reusable predicates over a concept. Role tests lower to those predicates during expression lowering.

- 03.08.001: A role declaration MUST have a name and a predicate.
- 03.08.002: Role predicates MUST be validated against the owning concept.
- 03.08.003: The compiler MUST preserve role declarations in the semantic model.
- 03.08.004: The compiler MUST lower role predicates to boolean Malloy dimensions where supported.
- 03.08.005: `path is RoleName` and `path is Concept.RoleName` tests MUST lower by substituting the role predicate with field references prefixed by `path`.
- 03.08.006: The compiler MUST report unresolved role tests.
- 03.08.007: The canonical name of a role MUST be its owning concept name, a dot, and its local role name, such as `Customer.Active`.
- 03.08.008: Multiple concepts MAY declare roles with the same local name; such roles MUST remain distinct by qualified name.
- 03.08.009: Bare role names in role tests SHOULD resolve through the tested path's concept when that concept can be inferred.
- 03.08.010: A role MAY declare a string `label` and string-array `aliases` metadata for search and presentation.
- 03.08.011: Role labels and aliases MUST NOT participate in semantic name resolution unless a later requirement explicitly defines that behavior.

## 03.09 Validations

Validations are named data-quality predicates. They describe invalid model states without acting as ordinary query filters.

- 03.09.001: A validation declaration MUST have a name.
- 03.09.002: A validation MAY include a description.
- 03.09.003: A validation MAY include a predicate.
- 03.09.004: Validation predicates MUST be validated against the owning concept when present.
- 03.09.005: The compiler MUST preserve validations in the semantic model.
- 03.09.006: V1 Malloy query lowering MUST NOT emit validations into analytical queries by default.
- 03.09.007: Validation names MUST be unique within the owning concept.

## 03.10 Concept Filters

Concept `where` filters restrict the concept source while remaining expression-shaped.

- 03.10.001: A concept MAY declare a single-line `where:` filter.
- 03.10.002: A concept MAY declare a section-style `where:` filter.
- 03.10.003: Concept filters MUST be validated against the owning concept.
- 03.10.004: Concept filters MUST lower to Malloy `where` clauses on the emitted source where supported.
