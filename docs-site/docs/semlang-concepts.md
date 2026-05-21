---
title: SemLang Concepts
---

SemLang concepts name what rows mean. A concept should not simply mirror a table, and it should not split a business object apart just because different systems store different columns.

The central modeling question is:

> Are these rows another description of the same thing, or are they a different thing connected to it?

Prefer one `kind` when sources describe the same durable business thing at the same identity grain, use the same ordinary business noun, and share a lifecycle. Split into a joined concept when the second source introduces a different lifecycle, temporal validity, relationship, event, or measurement grain.

## Concept Types

| Use this          | When the row means                                                                                           | Typical identity                                                                    | Good signs                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`            | A durable business thing people track over time.                                                             | The object's stable business key.                                                   | Users use a noun like customer, store, product, supplier, patient, facility, loan, user. The row can gain attributes without becoming a new occurrence.                                      |
| `event`           | Something that happened.                                                                                     | The event id, or a natural event key.                                               | It has an occurrence time, can be counted, and does not remain true indefinitely. Sale, claim, shipment, support case, payment, inspection.                                                  |
| `situation`       | An observed state of an event, relationship, or durable thing at a specific observation or validity context. | The subject plus observation time, valid time, scenario, version, or snapshot id.   | It answers "what was true then?" or "what was measured for this slice?" Inventory snapshot, health score, exposure snapshot, lab result, case status snapshot.                               |
| `relator`         | A relationship object with its own attributes or lifecycle.                                                  | A relationship id or the participating identities plus relationship discriminators. | The relationship can start, end, be approved, have status, carry amounts, or connect more than two things. Membership, contract, allocation, pledge, assignment.                             |
| `phase of Parent` | A lifecycle-specific form of an existing kind.                                                               | Usually the parent identity.                                                        | The same object is in a meaningful stage such as active customer, closed store, admitted patient, retired product. Use when the phase deserves concept-level modeling, not just a predicate. |
| `role`            | A named predicate over an existing concept.                                                                  | No new identity.                                                                    | The classification is useful in business language but does not create a new object or lifecycle. Active, enterprise, at risk, same store, eligible.                                          |
| `lens`            | A query-time interpretation or audience-specific overlay.                                                    | No new identity.                                                                    | The base model is correct, but a workflow needs filters, local definitions, or narrowed vocabulary without changing the core ontology.                                                       |

## Worked Example: Customer

Assume `Customer` is a `kind`: a durable customer account that sales, billing, product, and support teams all recognize. Other tables can still be modeled relative to that one kind in different ways.

| Source or table               | What people call it       | Grain                                       | Lifecycle                                               | Model it as                                       | Why                                                                                                                                                             |
| ----------------------------- | ------------------------- | ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crm_customers`               | Customer                  | One row per customer account.               | Born and retired with the customer lifecycle.           | Merge into `Customer`                             | Anchor source for the durable thing.                                                                                                                            |
| `billing_customer_profiles`   | Customer, billing profile | One row per customer account.               | Same customer lifecycle, different system owner.        | Merge into `Customer`                             | System ownership is not semantic identity. Same noun, grain, and lifecycle means same kind.                                                                     |
| `customer_success_attributes` | Customer                  | One row per customer account.               | Same customer lifecycle, maintained by success.         | Merge into `Customer`                             | More same-grain attributes about the same business thing.                                                                                                       |
| `high_value_customer_list`    | High-value customer       | One row per listed customer.                | Classification over existing customers.                 | `role` on `Customer`                              | The list names one useful predicate; it does not create a new identity or lifecycle.                                                                            |
| `customer_status_history`     | Customer status over time | One row per customer per status period.     | Status periods begin and end independently.             | `situation` joined to `Customer`                  | The row observes customer state for a validity period.                                                                                                          |
| `customer_health_snapshots`   | Customer health score     | One row per customer per scoring date.      | Scores are observed and refreshed independently.        | `situation` joined to `Customer`                  | The score is an observed state at a time, not a new customer.                                                                                                   |
| `account_users`               | User membership           | One row per user-customer membership.       | Memberships start and end independently.                | `relator` joining `Customer` and `ProductUser`    | The relationship has its own lifecycle and attributes.                                                                                                          |
| `subscriptions`               | Subscription or contract  | One row per subscription.                   | Subscriptions can start, renew, pause, or end.          | Usually `kind` or `relator`, joined to `Customer` | Use `kind` when teams track subscriptions as durable objects; use `relator` when the relationship among customer, product, plan, and terms is the main meaning. |
| `support_cases`               | Support case              | One row per case.                           | Cases open, update, and resolve independently.          | `event` joined to `Customer`                      | A case is something that happened in relation to the customer.                                                                                                  |
| `case_status_history`         | Case status               | One row per support case per status period. | Status periods begin and end within the case history.   | `situation` joined to `SupportCase`               | This is an observed state of an event-like thing, not another support case.                                                                                     |
| `invoices`                    | Invoice                   | One row per issued invoice.                 | Invoices are issued, adjusted, paid, or voided.         | `event` or `kind`, joined to `Customer`           | Use `event` for invoice issuance; use `kind` when invoices are durable business documents with their own lifecycle.                                             |
| `customer_report_view`        | Customer report row       | One row per report-specific projection.     | Report shape changes with the analysis, not the domain. | Query, view, or `lens`                            | Reporting convenience should not create a new ontology object.                                                                                                  |

This example is intentionally merge-friendly. The CRM, billing, and customer-success sources all describe the same `Customer` kind because they share the ordinary noun, identity grain, and lifecycle.

## Decision Heuristics

| If the other source...                                                       | Prefer                         | Why                                                            |
| ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------- |
| Adds columns at one row per object, with the same noun and lifecycle.        | Merge into the `kind`.         | Same source system is not required; same semantic identity is. |
| Adds optional columns for only some objects, still at the same grain.        | Usually merge into the `kind`. | Optionality alone does not create a new object.                |
| Defines a useful category over existing rows.                                | Add a `role`.                  | Roles name predicates without adding identity.                 |
| Describes a meaningful lifecycle stage of the same durable thing.            | Consider `phase of Parent`.    | Use a phase when the stage deserves concept-level treatment.   |
| Records values per date, period, scenario, run, version, locale, or channel. | Join a `situation`.            | The extra discriminator is part of the observed-state grain.   |
| Records something that happened.                                             | Join an `event`.               | Events have occurrence times and can be counted.               |
| Connects two or more concepts and carries its own fields, status, or dates.  | Join through a `relator`.      | The relationship has its own identity or lifecycle.            |
| Exists only for one report, audience, or workflow.                           | Use a query, view, or `lens`.  | Report shape should not become ontology shape.                 |

The important distinction is not "same table" or "different table." The important distinction is whether the rows have the same semantic identity and lifecycle.

## Common Modeling Smells

| Smell                                                                                            | Prefer                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `CrmCustomer`, `BillingCustomer`, and `SupportCustomer` all mean the same customer account.      | One `Customer` kind with composed same-grain fields, plus joined support events where needed.                             |
| A `kind` identity includes `snapshot_date`, `score_date`, `version`, or `scenario`.              | Usually a `situation` joined to the durable kind.                                                                         |
| A `kind` identity includes two other concept identities, such as `customer_id` and `program_id`. | Usually a `relator`, especially if it has status, dates, or measures.                                                     |
| A separate concept exists only to name `status = 'active'`.                                      | Usually a `role`; use `phase` only when the lifecycle stage has enough meaning to stand alone.                            |
| A source is merged because it is convenient for one report.                                      | Use a query, view, or lens. Keep the concept model faithful to identity and lifecycle.                                    |
| A source is split only because it lives in another system.                                       | Merge when it is the same noun, same identity grain, and same lifecycle. System ownership alone is not semantic identity. |
