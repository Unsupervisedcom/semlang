---
name: initial-ontology-creation
description: Use when creating an initial SemLang ontology from a data source, optional documentation, and user validation of core entities, relationships, roles, situations, measures, and sample questions.
---

# Initial Ontology Creation

Use this skill when a user wants to create an initial ontology for a domain, data product, warehouse schema, application database, or analytics package.

Assume the ontology is for production analytics unless the user says otherwise. The goal is not to mirror every table. The goal is to infer the domain's durable concepts, relationships, useful states, events, metrics, and question vocabulary, then validate that ontology with the user before treating it as authoritative.

## Operating Principles

- Start from the user's business domain and questions, not only from the physical schema.
- Treat existing documentation, data catalogs, ERDs, dbt docs, BI dashboards, metric definitions, tickets, and stakeholder notes as optional but high-value context.
- Preserve uncertainty. When a relationship, concept type, temporal grain, or metric meaning is inferred, mark it as inferred and validate it explicitly.
- When delegation is available and permitted, use a sub-agent for the data-connection and source-introspection work, then reuse that same sub-agent for the first-pass ontology creation. The calling agent should preserve context for user review, questions, and modeling decisions instead of spending it on the iterative mechanics of connection setup and bulk drafting.
- Prefer SemLang concept stereotypes deliberately:
  - `kind` for identity-bearing entities such as Customer, Event, Venue, Product, Account, or Supplier.
  - `event` for temporal occurrences such as Order, TicketScan, MessageSend, Incident, or Payment.
  - `situation` for state or measurement snapshots such as InventoryLevel, PriceSnapshot, SubscriptionStatus, or DailyBalance.
  - `relator` for association or bridge concepts such as EventAttraction, AccountMembership, ProductBundleItem, or ProviderFacilityAffiliation.
  - `phase` only for lifecycle stages of an entity, not table variants.
- Keep SemLang Malloy-shaped where possible. Do not invent syntax that cannot lower clearly.
- Model joins as a dedicated pass after the first concept inventory exists. Schema extraction usually exposes fields, not business relationships.
- Validate incrementally with the SemLang MCP `load_ontology` tool. Large ontologies should be organized into domain files and loaded in batches.

## Phase 1: Intake

Ask for the minimum information needed to begin. Prefer concise questions and proceed with reasonable assumptions when the user cannot answer everything.

Ask about the data source:

- What type of source system contains the data: warehouse/database, application database, API export, local files, remote files, or something else? If the source is local or remote files, use DuckDB to inspect and model them.
- Do you already know the catalog, schema, database, directory, file paths, or relevant source names, or should I introspect the source and bring back options?
- Are there any schemas, tables, files, or domains that should obviously be ignored?

Try to connect with the available information. Ask follow-up questions reactively only when connection attempts or source inspection reveal a concrete blocker.

Ask one optional context question:

```text
Are there any pre-existing sources of information about this data that I should use, such as a data catalog, ERD, dbt docs, BI dashboards, metric dictionary, business glossary, README, notebook, or examples of questions people ask?
```

If documentation is unavailable, continue from source inspection and make the missing context visible in the validation review.

## Phase 2: Source Inventory

Inspect the source system before authoring ontology files.

For each relevant table, file, or source:

- Record physical name, row count if cheaply available, description/comment, owner if available, and freshness if available.
- Extract columns with names, primitive types, nullability, comments, examples, and obvious semantic types.
- Identify candidate primary keys, natural keys, composite keys, unique fields, and deduplication concerns.
- Identify temporal fields such as created, updated, occurred, observed, effective, valid-from, valid-to, recorded, loaded, or partition dates.
- Identify money, count, duration, percentage, score, quantity, status, category, and identifier fields.
- Mark sources that appear intentionally out of scope, staging-only, legacy, duplicated, or unsafe to query.

If the source supports metadata commands, prefer structured metadata over scraping display text. For Databricks, use current CLI shapes such as `databricks tables get <catalog>.<schema>.<table>` when available.

## Phase 3: Documentation And Usage Analysis

Analyze optional documentation and existing usage to infer business meaning.

Look for:

- Business nouns that should become `kind` concepts.
- Processes or transactions that should become `event` concepts.
- Point-in-time states, balances, snapshots, inventory, pricing, eligibility, forecasts, or measurements that should become `situation` concepts.
- Association tables that should become `relator` concepts.
- Metric definitions, filters, cohorts, status meanings, lifecycle stages, and reporting grains.
- Synonyms and aliases used by different teams for the same concept.
- Questions that require joins, time windows, role filters, or aggregate measures.

Compare the docs against source inventory and note conflicts. When documentation and physical schema disagree, ask the user to resolve the business meaning before encoding it as canonical.

## Phase 4: Scaffold Concept Files

Start writing SemLang early. Do not create a separate long-lived inventory document unless the user asks for one.

Create domain-oriented SemLang files and use comments near the top of each file, source, or concept to hold the working notes that would otherwise live in a separate inventory. As the model becomes clearer, move more information out of comments and into real SemLang declarations.

For each candidate concept, capture in comments or declarations:

- Concept name in business language.
- Stereotype: `kind`, `event`, `situation`, `relator`, or `phase`.
- Physical source or source query.
- Grain: what one row represents.
- Identity fields and semantic identity types.
- Source row count observed during introspection, with an observation date.
- Description.
- Core fields and semantic types.
- Temporal axes, such as `occurrence_time` for events and `observation_time` for situations.
- Candidate joins to other concepts.
- Candidate roles, situations, measures, views, and validations.
- Confidence level and open questions.

Use comments such as:

```semlang
// Source audit 2026-05-21: prod.sales.orders had 12,431,992 rows.
// Grain: one row per submitted order.
// Open question: confirm whether cancelled orders remain in this source.
concept Order is event from databricks.table('prod.sales.orders') {
  ...
}
```

Group concepts into domain files by business area once the inventory is large enough. Use a single entry-point file that includes shared types before domain files. Avoid re-including shared files from every domain file.

## Phase 5: Relationship Pass

After the first concept files exist, perform a dedicated relationship pass.

For each concept:

- Search for fields whose semantic type identifies another concept.
- Add `join_one`, `join_many`, or `join_cross` only when the relationship is meaningful for analysis.
- Use `with` when the field name and target identity make the relationship obvious.
- Use explicit `on` clauses when source and target field names differ.
- Mark joins optional with `?` unless referential integrity is known.
- Avoid self-joins where the field is the concept's own identity.
- Model bridge tables as `relator` concepts when the association has its own grain, dates, roles, or measures.

Document important relationships in comments when the first SemLang draft cannot encode them yet.

## Phase 6: Measures, Roles, Situations, And Validations

Add reusable semantics after the structural model is coherent.

For each concept, identify:

- Roles: meaningful named predicates such as Active, Churned, HighRisk, Approved, Fulfilled, Late, or Premium.
- Situations: point-in-time measurements or state concepts related to the entity, such as AccountBalance, EventInventory, CustomerSegment, or SubscriptionStatus.
- Measures: aggregates that users will ask for repeatedly, including counts, sums, averages, rates, recency metrics, conversion metrics, monetary totals, and operational KPIs.
- Dimensions: reusable derived fields that clarify common grouping or filtering.
- Views: common analytical shapes that combine dimensions, measures, filters, and joins.
- Validations: data-quality expectations, not ordinary query filters.

Use roles only when the name carries reusable business meaning. If a filter merely narrows a source for one analysis, use a `where:` clause or lens instead.

## Phase 7: Draft And Validate The Ontology

Create the first SemLang draft in small, valid increments. Valid means loading the entry-point file with the SemLang MCP `load_ontology` tool and using the feedback to fix parse, semantic, source, and lowering issues.

- Put `package` first in every SemLang file.
- Put `include` declarations immediately after `package`.
- Define shared semantic `type:` declarations before concepts that use them.
- Keep concept files organized by domain rather than by physical schema when that improves comprehension.
- Add identity, fields, joins, temporal axes, roles, dimensions, measures, views, and validations in that order unless local style says otherwise.
- Keep source and concept audit notes in comments, especially row counts observed during introspection with the date stamp.
- Move more inferred meaning out of comments and into declarations as confidence increases.
- For ignored sources, use explicit ignored-source declarations with a reason when the project supports them.
- Run `load_ontology` after each coherent batch instead of waiting for the complete ontology.
- Keep unresolved questions visible near the relevant source or concept so review can happen in context.

## Phase 8: Independent Audit

Before presenting the ontology for validation, run a systematic audit. When delegation is available and permitted, have a sub-agent perform this audit independently, then iterate with that sub-agent until the issues are resolved or clearly deferred.

Check for:

- Missing `occurrence_time` on events.
- Missing `observation_time` on situations.
- Identifier fields that lack semantic identity types.
- Source columns with misleading primitive types, such as timestamp strings.
- Financial fields that should use money/currency semantic types.
- Field names that collide with SemLang keywords and need aliases.
- Duplicate table variants that should share consistent field and measure sets.
- Missing joins that make the ontology functionally flat.
- Measures that expose raw row fields without aggregate functions.
- Roles whose qualified names read redundantly.
- Source tables that were skipped without an explicit reason.
- Sample questions that cannot be answered from the current model.

Fix obvious issues before the user validation session. Keep unresolved business questions visible.

## Phase 9: User Validation Review

Review the ontology with the user in business language before treating it as complete. Present concise summaries and ask for corrections.

First, validate the core concepts and relationships:

```text
Here are the core concepts I found: the entities, events, situations, and relationship concepts, plus the important relationships between them. Do these seem right? What is missing, misnamed, or incorrectly connected?
```

Show:

- Each `kind`, `event`, `situation`, `relator`, and `phase`.
- What one row means for each concept.
- The most important joins and cardinalities.
- Any sources deliberately excluded and the reason.
- Open questions and low-confidence inferences.

Then validate each entity one at a time:

```text
For <Entity>, here are the roles and situations I found: the named states, categories, lifecycle stages, and point-in-time measurements of this concept. Are these right? Which names would your team use?
```

For every major `kind`, show:

- Roles defined directly on the entity.
- Related `situation` concepts that measure or describe the entity at a point in time.
- Related `event` concepts that happen to or because of the entity.
- Measures that summarize the entity, such as counts, revenue, recency, rates, balances, or quality metrics.
- Ambiguous statuses, flags, lifecycle fields, or business definitions that need confirmation.

Then validate sample questions:

```text
Here are sample questions this ontology should answer. Do these sound like the questions people actually ask? Which are wrong, low value, or missing?
```

Include a balanced set:

- Simple entity lookup questions.
- Time-windowed event questions.
- Relationship-navigation questions.
- KPI and metric questions.
- Cohort, segmentation, and status questions.
- Data-quality or operational exception questions.
- Questions that intentionally test optional joins and missing data.

Finally, solicit more real questions:

```text
What are five to ten real questions people ask about this domain that are painful, frequent, high-stakes, or currently require manual work?
```

For each added question, record whether the current ontology can answer it. If not, identify the missing concept, relationship, role, measure, temporal axis, validation, or source.

## Phase 10: Iterate And Handoff

After validation, revise the ontology and produce a concise handoff.

The handoff should include:

- Files created or changed.
- Data sources inspected.
- Core concepts and relationships.
- Key roles, situations, measures, and views.
- Ignored or deferred sources.
- Validation questions answered by the user.
- Remaining open questions.
- Example questions the ontology can answer now.
- Suggested next modeling passes.

Run the project's validation command before handoff when working in a repository. For SemLang projects, prefer the repository's full check command when available.
