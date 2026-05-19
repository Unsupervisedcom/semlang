# Supported Malloy Features in OntoQL

This audit compares OntoQL's current compiler surface with the official Malloy documentation. It focuses on what the OntoQL parser, resolver, and emitter accept today and whether the emitted Malloy preserves the documented Malloy behavior.

`Supported in OntoQL` is exactly `Supported` only when the feature works as expected. Other statuses call out reduced syntax, validation limits, or intentionally deferred areas.

## Official Malloy Sources Reviewed

- [What Is Malloy](https://docs.malloydata.dev/documentation)
- [Models](https://docs.malloydata.dev/documentation/language/statement)
- [Sources](https://docs.malloydata.dev/documentation/language/source)
- [Connections](https://docs.malloydata.dev/documentation/language/connections)
- [Database Support](https://docs.malloydata.dev/documentation/setup/database_support)
- [VS Code Extension](https://docs.malloydata.dev/documentation/setup/extension)
- [SQL Sources](https://docs.malloydata.dev/documentation/language/sql_sources)
- [Imports](https://docs.malloydata.dev/documentation/language/imports)
- [Queries](https://docs.malloydata.dev/documentation/language/query)
- [Views](https://docs.malloydata.dev/documentation/language/views)
- [Fields](https://docs.malloydata.dev/documentation/language/fields)
- [Aggregates](https://docs.malloydata.dev/documentation/language/aggregates)
- [Expressions](https://docs.malloydata.dev/documentation/language/expressions)
- [Functions](https://docs.malloydata.dev/documentation/language/functions)
- [Filters](https://docs.malloydata.dev/documentation/language/filters)
- [Filter Expressions](https://docs.malloydata.dev/documentation/language/filter-expressions)
- [Data Types](https://docs.malloydata.dev/documentation/language/datatypes)
- [Ordering and Limiting](https://docs.malloydata.dev/documentation/language/order_by)
- [Calculations and Window Functions](https://docs.malloydata.dev/documentation/language/calculations_windows)
- [Joins](https://docs.malloydata.dev/documentation/language/join)
- [Nested Views](https://docs.malloydata.dev/documentation/language/nesting)
- [Tags](https://docs.malloydata.dev/documentation/language/tags)
- [Quick Reference](https://docs.malloydata.dev/documentation/language/quick_reference.html)
- [Dimensional Indexes](https://docs.malloydata.dev/documentation/patterns/dim_index)
- [Parameters Experiment](https://docs.malloydata.dev/documentation/experiments/parameters)
- [CLI Setup](https://docs.malloydata.dev/documentation/setup/cli)
- [The Malloy CLI](https://docs.malloydata.dev/documentation/malloy_cli/index)
- [Visualizations Overview](https://docs.malloydata.dev/documentation/visualizations/overview)
- [Explorer UI](https://docs.malloydata.dev/documentation/user_guides/publishing/explorer)
- [Transform and Materialize](https://docs.malloydata.dev/documentation/user_guides/transform.html)
- [Persistence Experiment](https://docs.malloydata.dev/documentation/experiments/persistence)
- [HyperLogLog](https://docs.malloydata.dev/documentation/language/hyperloglog)
- [Malloy v4 Warnings](https://docs.malloydata.dev/documentation/language/m4warnings)

## Model, Sources, and Connections

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| Malloy model document | A Malloy file contains import, source, query, and run statements, plus comments and tags. | Partial | OntoQL requires `package` and accepts `include`, `type`, `source`, `concept`, `lens`, and `query`. It does not accept `run:` or general Malloy files. |
| Statement separators | Malloy statements may use optional semicolons for clarity. | Not supported | OntoQL is line/block oriented and does not parse semicolon-separated statements. |
| Line comments | Malloy supports comments in model files. | Supported | OntoQL strips `//` line comments. Malloy `#` annotations are not comments in OntoQL. |
| Named connections | Malloy references configured connections with `connection_name.table(...)` or `connection_name.sql(...)`. | Supported | OntoQL requires the named connection prefix and emits it unchanged. It does not validate that the connection exists. |
| Default connections | Malloy can create default connections when the connection name matches a database type such as `duckdb`, `bigquery`, or `postgres`. | Partial | OntoQL emits default-looking names such as `duckdb`; default creation is delegated to the Malloy runtime or CLI. |
| Connection configuration files | Malloy CLI and VS Code use `malloy-config.json` and related project/global config discovery. | Not supported | OntoQL has no connection-file parser or runtime configuration layer. |
| Supported database dialects | Malloy documents DuckDB, MotherDuck, BigQuery, Databricks, Snowflake, PostgreSQL, MySQL, Trino/Presto, and MSSQL via DuckDB. | Partial | OntoQL can emit any connection name syntactically. Dialect support depends entirely on downstream Malloy tooling. |
| `.table()` source method | Malloy uses `.table()` to reference a database table, SQL view, file, URL, or dialect-specific table path. | Supported | OntoQL accepts `name.table('...')`, `name.table("...")`, and named connection source expressions. |
| `.sql()` source method | Malloy uses `.sql()` to define a source from a SQL query, commonly with multiline triple-quoted SQL. | Supported | OntoQL accepts quoted and multiline triple-quoted SQL source strings in source and concept declarations and emits `.sql(...)` unchanged. |
| SQL source direct query use | Malloy SQL sources can be run directly or defined as `query:` without a view block in documented cases. | Partial | OntoQL can declare sources from `.sql()` and can attach a limited `-> { ... }` body. `query: q is duckdb.sql("...")` is not parsed. |
| SQL source extension | Malloy SQL sources can be extended like other sources. | Partial | OntoQL can model a concept from `.sql()` and emit a Malloy `extend` block. Arbitrary `source: x is sql_source extend { ... }` is not parsed. |
| Malloy-in-SQL interpolation | Malloy supports `%{ ... }` inside triple-quoted SQL sources. | Not supported | OntoQL treats SQL source text as an opaque string and does not compile embedded Malloy queries. |
| Virtual sources | Malloy has experimental `.virtual()` sources with type declarations. | Deferred | OntoQL only parses `.table()`, `.sql()`, and simple named references. |
| Sources from Malloy queries | Malloy query results have schemas and can be used as sources. | Partial | OntoQL can reference a named OntoQL query as a concept source. It cannot declare arbitrary Malloy query-source pipelines. |
| Source references | Malloy sources can be named and reused. | Supported | OntoQL `source:` declarations and concepts can reference previously declared sources, concepts, and queries by simple name. |
| Source parameters | Malloy's parameters experiment allows parameterized source declarations and source invocation. | Deferred | OntoQL has no parameter declaration, invocation, binding, or lexical-scope support. |
| Givens / model parameters | Malloy documents experimental model-wide runtime parameters. | Deferred | No OntoQL syntax or compiler support exists. |

## Source Extensions and Refinement

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| Source `extend` block | Malloy extends sources with filters, fields, joins, primary keys, views, renames, and visibility controls. | Partial | OntoQL concept bodies emit Malloy `source: ... extend { ... }`. General Malloy `source: x is y extend { ... }` is not parsed. |
| Primary keys | Malloy declares `primary_key:` to support joins and aggregate correctness. | Supported | OntoQL `identity` emits `primary_key:`. Composite identities lower to `concat(...)`. |
| Source-level filters | Malloy source `where:` filters apply to every query against the source. | Supported | OntoQL concept `where:` and lens `where:` refinements emit Malloy source filters. |
| Adding dimensions, measures, and views | Malloy source extensions can define reusable dimensions, measures, and views. | Supported | OntoQL supports `dimension:`, `measure:`, and single-stage `view:` blocks inside concepts and lens refinements. |
| Adding joins in extensions | Malloy source extensions can declare join relationships. | Supported | OntoQL supports concept `join_one`, `join_many`, and `join_cross`. |
| Rename fields | Malloy source extensions can rename available fields. | Not supported | OntoQL has no field-rename syntax. |
| Limit available fields / access modifiers | Malloy documents field visibility/access-related capabilities, including experimental access modifiers. | Deferred | OntoQL field declarations are semantic and validation-oriented; they do not hide or expose Malloy fields. |
| Inline source extension in a query | Malloy can query `some_source extend { ... } -> { ... }`. | Not supported | OntoQL query roots are concept names and do not parse inline `extend`. |
| View/source refinement with `+` | Malloy refines views or partial queries with `+ { ... }`. | Partial | OntoQL lenses provide a separate semantic refinement mechanism for concepts. Malloy `+` refinement syntax is not parsed. |
| Annotations and tags | Malloy collects `#` and `##` annotations and renderer tags with named objects and the model. | Partial | OntoQL does not parse arbitrary Malloy annotations. It can emit limited currency annotations inferred from semantic type metadata. |
| Compiler annotations | Malloy uses annotations such as `##! experimental.parameters` to enable experiments. | Not supported | OntoQL does not parse or emit compiler-option annotations. |
| Persistence annotations | Malloy CLI can build persistent tables from persistence annotations. | Deferred | OntoQL has no persistence/build feature. |

## Joins and Relationships

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| `join_one` | Malloy declares non-fanout relationships with `join_one:`. | Supported | OntoQL emits Malloy `join_one:` from `join_one name: Target on ...`. |
| `join_many` | Malloy declares fanout relationships with `join_many:`. | Supported | OntoQL emits Malloy `join_many:` from `join_many name: Target on ...`. |
| `join_cross` | Malloy declares cross-product joins with `join_cross:`. | Supported | OntoQL parses and emits `join_cross`, with optional `on` expressions. |
| Default left outer join semantics | Malloy joins are left outer joins by default. | Supported | OntoQL emits ordinary Malloy joins, so Malloy's default join semantics apply. |
| Foreign-key `with` joins | Malloy can join through a target `primary_key` with `join_one: target with foreign_key`. | Supported | OntoQL parses and emits Malloy `with` joins, validates the source expression, and requires a target identity where the target concept is known. |
| Boolean `on` joins | Malloy joins can use explicit boolean `on` expressions. | Supported | OntoQL supports `on` expressions and prefixes simple right-side field references during lowering. |
| Join aliases | Malloy can alias a joined source with `is`. | Supported | OntoQL join names act as aliases and emit `join_one: alias is target_source`. |
| Inline join sources | Malloy can join an inline table/source expression. | Not supported | OntoQL joins target known concepts or global role names only. |
| Optional participation marker | OntoQL has `?` on joins; Malloy documents left outer joins rather than an optional marker. | Partial | OntoQL parses `?` as semantic metadata, but the emitted Malloy join is unchanged. |
| Joined field paths | Malloy fields from joined sources are referenced with dotted paths. | Supported | OntoQL validates and emits dotted paths through declared joins. |
| Joined source measures | Malloy can use measures from joined sources while preserving aggregate correctness. | Supported | OntoQL can reference joined measures such as `customer.some_measure`; Malloy performs the aggregate semantics after emission. |
| Aggregate safety across joins | Malloy tracks join cardinality to avoid fan and chasm traps. | Supported | OntoQL emits `join_one` and `join_many`, preserving the cardinality metadata Malloy needs. |
| Explicit aggregate locality syntax | Malloy supports `source.avg(expr)` and `join.field.avg()` to control aggregate locality. | Supported | OntoQL validates relation-aware aggregate method paths such as `source.sum(expr)`, `join_name.count()`, and `join_name.field.avg()` and emits them unchanged. |
| Nested/repeated arrays as joins | Malloy treats arrays and repeated records like nested joined data where supported by the dialect. | Not supported | OntoQL has no array or repeated-record field model. |
| Experimental inner/right/full joins | Malloy documents inner/right/full joins as experimental. | Deferred | OntoQL does not parse experimental join kinds or SQL join-type modifiers. |

## Fields, Types, Views, and Queries

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| Dimensions | Malloy dimensions are reusable scalar expressions. | Supported | OntoQL `dimension:` definitions emit Malloy dimensions. |
| Measures | Malloy measures are reusable aggregate expressions. | Supported | OntoQL `measure:` definitions emit Malloy measures. |
| Source-backed fields | Malloy table columns are available automatically; fields can also be modeled. | Partial | OntoQL `field:` declarations are used for semantic typing and validation but do not emit Malloy field declarations. |
| Field calculations in queries | Malloy fields can be defined directly in query clauses with `is`. | Supported | OntoQL supports aliases in `select:`, `group_by:`, `aggregate:`, and `calculate:` items. |
| Calculations | Malloy `calculate:` fields are analytic/window calculations available in views. | Supported | OntoQL parses, validates, and emits `calculate:` clauses in query and view bodies. |
| Primitive types | Malloy types include number, string, boolean, date, timestamp, record, and array. | Partial | OntoQL supports `string`, `number`, `date`, `timestamp`, `currency`, and `boolean`; it does not support Malloy `record` or `array` types. |
| Numeric subtypes | Malloy tracks integer, bigint, and float internally. | Not supported | OntoQL exposes only `number` and does not model numeric subtypes. |
| Semantic type declarations | Malloy has type-related features and experiments; OntoQL adds semantic value domains. | Partial | OntoQL `type:` metadata is preserved and can drive limited annotations, but it is not full Malloy type syntax. |
| Views | Malloy views are named reusable query shapes on a source. | Supported | OntoQL supports single-stage `view: name is { ... }` inside concepts with `where`, `select`/`project`, `group_by`, `aggregate`, `having`, `calculate`, `nest`, `index`, `order_by`, and `limit` clauses. |
| Multi-stage views | Malloy views can contain multiple stages separated by `->`. | Not supported | OntoQL views have one query body only. |
| Projection views | Malloy projections use `select:`. | Supported | OntoQL parses, validates, and emits `select:` in query and view bodies. |
| View references in queries | Malloy queries can run `source -> view_name`. | Partial | OntoQL query declarations can target a named view on the root concept using `query: name is Concept -> view_name`. Arbitrary view-reference pipelines are not parsed. |
| View refinement | Malloy views can be refined with `+ { ... }`. | Not supported | OntoQL has no Malloy view-refinement syntax. |
| Turtles / legacy nested query shapes | Current Malloy docs describe reusable query shapes as views and nested views. | Partial | OntoQL supports basic named views, but not nested views, pipelines, or refinement-style turtle composition. |
| Named queries | Malloy `query:` defines reusable transformations. | Supported | OntoQL `query: name is Concept -> { ... }` emits a Malloy named query. |
| Query roots | Malloy queries can begin from many source expressions. | Partial | OntoQL query roots are concept names. Arbitrary table, SQL, or parameterized source roots are not parsed in `query:`. |
| Run statements | Malloy `run:` executes a query in a model. | Not supported | OntoQL emits named Malloy queries but has no `run:` syntax. |
| Query pipelines | Malloy stages can be chained with `->`. | Not supported | OntoQL top-level queries and views parse exactly one body. |
| Query partials and shorthand | Malloy allows query fragments and shorthand composition. | Not supported | OntoQL requires explicit `query: ... -> { ... }` and explicit clauses. |
| Queries as sources | Malloy query outputs can be queried again as sources. | Partial | OntoQL can model a concept from a named query. It cannot express arbitrary query-source pipelines or schema inference. |

## Query Clauses and Operators

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| `where:` | Malloy filters a source, stage, measure, or nested view depending on placement. | Supported | OntoQL supports source/concept, view, query, and lens `where:` for stage/source filters. Filtered measure expressions can be passed through in measure expressions. |
| Multiple comma filters | Malloy `where: x, y` means `x and y`. | Supported | OntoQL emits the expression unchanged when paths validate. |
| `group_by:` | Malloy reductions group by dimensions or scalar expressions. | Supported | OntoQL parses and emits `group_by:` items and aliases. |
| `aggregate:` | Malloy reductions include measures or aggregate expressions. | Supported | OntoQL parses and emits `aggregate:` items and aliases, with extra checks against raw fields in aggregate aliases. |
| `select:` | Malloy projections select fields without reducing grain. | Supported | OntoQL parses, validates, and emits `select:` query and view clauses. |
| `project:` | Malloy v4 docs say `project:` is deprecated and renamed to `select:`. | Supported | OntoQL parses deprecated `project:` in query and view bodies and emits the equivalent `select:` clause. |
| `order_by:` | Malloy sorts by output fields or expressions and supports multiple orderings. | Supported | OntoQL parses, validates, and emits `order_by:` items, including `asc` and `desc` suffixes. |
| Implicit ordering | Malloy applies documented default ordering for dates and measures. | Partial | OntoQL does not emit explicit ordering, so Malloy defaults apply to emitted queries. OntoQL cannot configure or override them. |
| `limit:` | Malloy limits row counts with `limit: integer`. | Supported | OntoQL parses and emits integer `limit:` clauses. |
| `top:` | Malloy accepts `top:` as a readability alias for `limit:`. | Supported | OntoQL accepts `top:` and emits the equivalent `limit:` clause. |
| `having:` | Malloy supports post-aggregate filters in query blocks. | Supported | OntoQL parses, validates, and emits `having:` in query, view, and inline nested query bodies. |
| `calculate:` | Malloy supports analytic calculations after reductions. | Supported | OntoQL parses, validates, and emits `calculate:` clauses. |
| `nest:` | Malloy nests views or inline nested query blocks to produce subtables. | Partial | OntoQL parses, validates, and emits named view nests and inline `name is { ... }` nested query blocks in query and view bodies. |
| Named nested views | Malloy can nest named source views with `nest:`. | Supported | OntoQL validates named `nest:` references against views on the query root concept and emits optional aliases unchanged. |
| Nested nested views | Malloy nested views can recurse to multiple levels. | Partial | OntoQL supports nested inline `nest:` blocks recursively, but validation is still rooted in the enclosing concept rather than inferred from each nested stage output. |
| `index:` | Malloy builds dimensional search indexes with `index:`. | Partial | OntoQL parses, validates, and emits simple `index:` items with optional aliases. Advanced dimensional-index options are not parsed. |
| Index `by` and `sample` | Malloy dimensional indexes can weight and sample indexed fields. | Not supported | OntoQL supports simple `index:` items, but does not parse `by` weighting or `sample` options. |
| Wildcard projection | Malloy supports `select: *` and joined wildcards. | Not supported | OntoQL supports explicit `select:` items, but does not support wildcard field expansion. |

## Expressions, Functions, Literals, and Filters

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| Identifiers and dotted paths | Malloy references fields with names and dotted join paths. | Supported | OntoQL validates paths against identities, fields, dimensions, measures, roles, and declared joins. |
| Human identifiers / backticks | Malloy supports quoted identifiers with arbitrary characters. | Not supported | OntoQL names must be ASCII identifier tokens such as `sale_id`. |
| Arithmetic operators | Malloy supports ordinary arithmetic such as `x * 100` and `(a + b) / c`. | Supported | OntoQL passes arithmetic through after path validation. |
| Comparisons | Malloy supports `=`, `!=`, `<`, `>`, `<=`, `>=`, and null comparisons. | Supported | OntoQL passes comparison expressions through and recognizes `null` keywords. |
| Boolean operators | Malloy supports `and`, `or`, and `not`. | Supported | OntoQL recognizes these keywords and emits them unchanged. |
| Numeric literals | Malloy supports integer, decimal, and exponent numeric literals. | Partial | OntoQL accepts common numeric text by pass-through but does not implement Malloy's full literal grammar explicitly. |
| String literals | Malloy supports single, double, and triple-quoted strings in expressions. | Partial | OntoQL strips normal quoted strings for validation and supports quoted source method arguments. Multiline expression-string handling is limited. |
| Date and timestamp literals | Malloy uses `@` literals for dates, weeks, months, quarters, and years. | Partial | OntoQL generally passes date literal text through, but it does not validate Malloy date-literal forms. |
| Boolean literals | Malloy supports `true` and `false`. | Supported | OntoQL recognizes boolean literals as expression keywords. |
| Array literals | Malloy supports array literals. | Not supported | OntoQL does not parse or type arrays. |
| Record literals | Malloy supports record literals. | Not supported | OntoQL does not parse or type records. |
| Type casts | Malloy uses `::` and dialect-native target types. | Partial | OntoQL can pass through simple casts, but type validation is oriented to OntoQL primitive and semantic types. |
| Safe casts | Malloy uses `:::` when supported by the dialect. | Not supported | OntoQL lexer/parser support is not defined for safe-cast syntax. |
| SQL-style `CASE` | Malloy documentation emphasizes `pick`, while existing examples may use SQL-style case expressions. | Partial | OntoQL examples and tests pass through `case when ... then ... else ... end`; Malloy `pick` syntax is not recognized by validation. |
| Malloy `pick` expressions | Malloy provides `pick` as an improved case expression. | Not supported | `pick` is not an OntoQL expression keyword and fails validation in strict contexts. |
| Apply operator and alternation | Malloy supports `?`, partial comparisons, and alternation for readable filters. | Supported | OntoQL validates referenced paths in these filters and emits the Malloy expression unchanged. |
| Filter expression strings | Malloy has `f'...'` filter-expression sublanguages for string, numeric, temporal, and boolean filters. | Supported | OntoQL recognizes f-string filter literals during validation and emits them unchanged. |
| Ranges with `to` | Malloy range expressions support filters such as `10 to 20`. | Supported | OntoQL recognizes `to` in expression validation and passes range syntax through. |
| Like and regex filters | Malloy supports `~`, `!~`, string patterns, regex strings, and f-strings. | Supported | OntoQL validates path references around `~`/`!~`, regex strings, and f-strings while preserving the original Malloy syntax. |
| Date part properties | Malloy supports date/timestamp access such as `.date`, `.month`, `.week`, `.quarter`, `.year`, and `.day`. | Supported | OntoQL path validation explicitly permits these scalar properties after a known path. |
| Standard scalar functions | Malloy documents many string, numeric, date, interval, and other scalar functions. | Supported | OntoQL recognizes the documented scalar function names in validation and emits function calls unchanged. |
| Standard aggregate functions | Malloy supports many aggregates including `count`, `sum`, `avg`, `min`, `max`, and `stddev`. | Supported | OntoQL recognizes documented aggregate names, plus the existing `median` compatibility allowance, and emits calls unchanged. |
| Raw SQL functions | Malloy supports `function!type(args)` and related raw SQL function syntax. | Not supported | OntoQL does not model `!` function syntax or return-type declarations. |
| Filtered aggregates | Malloy supports expressions like `count() { where: condition }`. | Supported | OntoQL validates paths inside filtered aggregate expressions and avoids treating the filter predicate as a raw-field aggregate-alias leak. |
| Ungrouped aggregate controls | Malloy supports `all()` and `exclude()` for subtotals and percent-of-total calculations. | Supported | OntoQL recognizes `all` and `exclude` as aggregate functions for validation and emits them unchanged. |
| Relation-aware aggregate methods | Malloy supports `join_name.field.avg()` and related aggregate locality methods. | Supported | OntoQL validates relation-aware method paths on root sources and joins and emits them unchanged. |
| Window / analytic functions | Malloy documents analytic functions such as `lag` and `rank` for `calculate:`. | Supported | OntoQL recognizes the documented analytic/window function names in validation and emits them unchanged in `calculate:` expressions. |
| HyperLogLog functions | Malloy documents HLL functions such as `hll_accumulate`, `hll_estimate`, `hll_combine`, `hll_export`, and `hll_import`. | Partial | These can only be pass-through function text in permissive contexts; OntoQL does not recognize HLL types or validate HLL-specific semantics. |

## Imports, Includes, and Reuse

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| `import "file.malloy"` | Malloy imports exported sources from another Malloy file. | Not supported | OntoQL uses `include`, not Malloy `import`. |
| `include "file.ontoql"` | OntoQL-specific package inclusion. | Supported | Relative includes are loaded before the including file and include cycles are diagnosed. |
| Selective imports | Malloy supports `import { a, b is a } from "file.malloy"`. | Not supported | OntoQL includes all declarations from an included OntoQL file and has no rename syntax. |
| Import locations | Malloy imports may use relative, absolute, file URL, or HTTPS URL paths. | Partial | OntoQL's default file loader resolves paths relative to the including file; URL loading is not built in. |
| Exported objects | Malloy import semantics refer to exported objects from another file. | Not supported | OntoQL has no export visibility controls. Included declarations are merged into one semantic model. |
| Include cycle detection | Malloy tooling detects invalid import cycles. | Supported | OntoQL diagnoses include cycles. |

## Rendering, Drill, Export, and Tooling

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| Renderer metadata | Malloy compilation and execution return result metadata used by rendering libraries. | Not supported | OntoQL emits Malloy text and diagnostics only; it does not execute queries or return Malloy result schemas. |
| Renderer tags | Malloy renderer tags guide tables, charts, dashboards, maps, lists, numbers, links, and model options. | Partial | OntoQL can emit limited currency annotations from semantic type metadata; arbitrary renderer tags are not parsed. |
| Drill metadata | Malloy metadata can support visualization drill-through experiences. | Deferred | OntoQL has no drill metadata, query rewrite, or renderer integration. |
| Explorer UI visual queries | Malloy Explorer builds valid Malloy queries using dimensions, measures, filters, views, limits, ordering, and nests. | Deferred | OntoQL has no Explorer integration and still lacks nested views, indexes, renderer metadata, and Explorer-specific query generation. |
| MalloySQL | MalloySQL mixes SQL, Malloy imports, and `%{ ... }` embedded Malloy queries. | Not supported | OntoQL does not parse `.malloysql` or embedded Malloy query blocks. |
| Export to Parquet / materialization | MalloySQL and the CLI can materialize or export query results. | Deferred | OntoQL only compiles OntoQL to Malloy text. |
| CLI `run`, `compile`, and `build` | Malloy CLI runs, compiles, and builds Malloy/MalloySQL files. | Not supported | OntoQL has its own compile boundary and does not invoke Malloy CLI commands. |
| Python and Jupyter integrations | Malloy provides Python package and notebook magic commands. | Not supported | OntoQL has no Python/Jupyter runtime integration. |
| Publisher and REST APIs | Malloy Publisher exposes models, Explorer, SDK, REST, and MCP integrations. | Not supported | OntoQL does not publish or serve Malloy models. |

## OntoQL-Specific Features Beyond Malloy

| Feature | Malloy behavior | Supported in OntoQL | Notes |
| --- | --- | --- | --- |
| Packages | Malloy models do not require an OntoQL-style package declaration. | Supported | OntoQL requires exactly one `package` declaration. |
| Concepts | Malloy's closest unit is a source. | Supported | OntoQL concepts lower to Malloy sources with semantic stereotypes kept in the OntoQL model. |
| Concept stereotypes | Malloy does not model `kind`, `event`, `situation`, `relator`, or `phase`. | Supported | OntoQL parses and validates these stereotypes, then emits ordinary Malloy sources. |
| Roles | Malloy does not have OntoQL role predicates. | Supported | OntoQL roles lower to dimensions and role tests lower to predicates. |
| Temporal axes | Malloy has date/time expressions but not OntoQL temporal-axis declarations. | Supported | OntoQL parses temporal axes and lowers valid-time `at` joins to period containment predicates. |
| Lenses | Malloy has source/view refinement; OntoQL adds query-time semantic overlays. | Supported | OntoQL applies lenses to a cloned semantic model for a query and emits lens-local Malloy sources. |
| Validations | Malloy can express filters, but not OntoQL validation blocks as a first-class construct. | Partial | OntoQL parses and validates validation predicates but does not emit analytical Malloy for validation execution. |
