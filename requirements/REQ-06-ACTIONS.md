# REQ-06-ACTIONS: Concept-Local Actions and Writeback Semantics

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern active ontology actions, action subjects, parameters, guards, editable members, write mappings, action logs, side effects, and action lowering. Actions describe permitted writes. They do not change Malloy read/query lowering.

## 06.01 Action Declarations

Actions are declared inside the concept they act on.

- 06.01.001: An action declaration MUST be nested inside a concept declaration.
- 06.01.002: An action declaration MUST have a name.
- 06.01.003: Action names MUST be unique within the owning concept.
- 06.01.004: The compiler MUST preserve action declarations in the AST and semantic model.
- 06.01.005: V1 Malloy emission MUST ignore actions.
- 06.01.006: Package-level actions are out of scope until a concrete objectless or cross-object use case is accepted.

## 06.02 Action Subject

The subject describes what object set the action is about.

- 06.02.001: An action MUST declare exactly one `subject`.
- 06.02.002: `subject` MUST be one of `single`, `new`, or `collection`.
- 06.02.003: `single` MUST mean one existing object of the owning concept.
- 06.02.004: `new` MUST mean one new object of the owning concept.
- 06.02.005: `collection` MUST mean a list of existing objects of the owning concept.
- 06.02.006: `this` MUST refer to the subject object for `single`.
- 06.02.007: `this` MUST refer to the item under evaluation for `collection`.
- 06.02.008: `this` MUST be bound by the owning-concept `insert` edit for `new`.
- 06.02.009: Subject body metadata such as `max` and `atomic` SHOULD be preserved for future execution planning.

## 06.03 Parameters

Parameters define the action input contract.

- 06.03.001: An action MAY declare a `param:` section.
- 06.03.002: Each parameter MUST have a name and type annotation.
- 06.03.003: Parameter names MUST be unique within an action.
- 06.03.004: Parameter types MUST resolve according to `REQ-01-TYPES.md`.
- 06.03.005: Parameter type JSON Schema metadata MUST be reusable for future action manifest schemas.
- 06.03.006: Parameters MAY declare default expressions and hidden metadata.

## 06.04 Guards

Guards are submission criteria evaluated before edits.

- 06.04.001: An action MAY declare a `guard:` section.
- 06.04.002: Each guard MUST preserve its predicate expression.
- 06.04.003: A guard MAY include an `else` message for user-facing failure reporting.
- 06.04.004: Guards MAY reference `this`, action parameters, fields, dimensions, joins, roles, and runtime context such as `current_user`.
- 06.04.005: V1 validation MAY defer full guard expression type-checking.

## 06.05 Writeable Fields and Dimensions

Actions can assign only members that explicitly opt into writes.

- 06.05.001: A source-backed field MAY be marked `writeable`.
- 06.05.002: A source-backed `writeable` field with no explicit mapping MUST imply a default mapping equivalent to `write: column field_name = value`.
- 06.05.003: A derived dimension MAY be marked `writeable` only when it declares an explicit write mapping.
- 06.05.004: A writeable dimension without a write mapping MUST be rejected.
- 06.05.005: Measures, joins, roles, views, validations, identities, and temporal axes MUST NOT be action assignment targets.
- 06.05.006: V1 Malloy emission MUST ignore writeability metadata and write mappings.

## 06.06 Write Mappings

Write mappings explain how a semantic value becomes one or more physical assignments.

- 06.06.001: A write mapping MAY be a portable `column` assignment.
- 06.06.002: A `column` mapping MUST name a physical column and an expression over the reserved `value` binding.
- 06.06.003: A write mapping MAY be a raw SQL assignment fragment.
- 06.06.004: Raw SQL write mappings MUST be assignment fragments, not complete SQL statements.
- 06.06.005: Raw SQL write mappings MUST use placeholders such as `{value}` for runtime parameter binding.
- 06.06.006: The runtime, not the mapping, MUST own full `UPDATE` statements, `WHERE` clauses, transaction boundaries, authorization checks, and parameter binding.
- 06.06.007: A semantic member MAY map to multiple physical assignments.

## 06.07 Edits

The edit block declares the semantic change plan.

- 06.07.001: An action MAY declare an `edit:` section.
- 06.07.002: `subject: single` actions MAY use `set member = expression` edits.
- 06.07.003: `subject: collection` actions MAY use `set member = expression` edits, evaluated per subject item.
- 06.07.004: `subject: new` actions MUST use an owning-concept `insert` edit in V1.
- 06.07.005: `insert` edits MUST be rejected unless the action subject is `new`.
- 06.07.006: `set` edits MUST target known writeable fields or writeable dimensions.
- 06.07.007: `set` edits MUST be rejected when the target is unknown or non-writeable.

## 06.08 Logs and Side Effects

Logs and side effects describe runtime behavior outside the core write plan.

- 06.08.001: An action MAY declare a `log` block.
- 06.08.002: An action MAY declare `effect before_commit` and `effect after_commit` blocks.
- 06.08.003: Log and effect bodies SHOULD be preserved for future manifest emission.
- 06.08.004: V1 compilers MAY defer full validation of log and effect bodies.

## 06.09 Agent Exposure

Agent metadata controls presentation to tool and assistant surfaces.

- 06.09.001: An action MAY declare an `agent:` metadata section.
- 06.09.002: Agent metadata MAY include `expose`, `risk`, `requires_confirmation`, and `idempotency_key`.
- 06.09.003: Agent metadata MUST NOT be treated as authorization.
- 06.09.004: Agent metadata SHOULD be preserved for future manifest emission.

## 06.10 Lowering

Actions produce a write-oriented artifact separate from Malloy.

- 06.10.001: Actions MUST NOT lower to Malloy.
- 06.10.002: A future action manifest SHOULD include owning concept, subject mode, parameter schemas, guards, edit plans, write mappings, log configuration, side effects, and agent metadata.
- 06.10.003: Runtime adapters MAY turn the action manifest into SQL, API calls, queue messages, or other write mechanisms.
