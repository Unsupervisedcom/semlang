# SemLang Actions Requirements

This document defines the first implementation slice for SemLang actions. The language reference in `docs-site/docs/language-reference/actions.md` is the user-facing contract; this file is the implementation checklist.

## Goals

- Add active ontology operations while keeping Malloy as the read/query lowering target.
- Model actions as concept-local declarations with an explicit `subject` mode.
- Reuse JSON Schema-backed semantic types for action parameter and assigned-value validation.
- Make common writes terse: `writeable` source-backed fields imply `column name = value`.
- Require explicit write mappings for derived dimensions or nontrivial physical storage.
- Preserve enough structure in the AST and semantic model to emit an action manifest later.

## Non-Goals for the First Slice

- Do not execute actions outside the MCP `invoke_action` adapter.
- Do not emit action SQL as part of Malloy read/query lowering.
- Do not lower actions into Malloy.
- Do not implement authorization, current-user resolution, notifications, webhooks, branch writes, or reverts yet.
- Do not attempt inverse solving for arbitrary derived dimensions.

## Syntax Requirements

Actions are nested inside concepts:

```semlang
concept SupplierLot is kind from duckdb.table('supplier_lots') {
  action quarantine {
    subject: single

    param:
      reason :: QuarantineReason

    guard:
      status in ['received', 'released']
        else "Only received or released lots can be quarantined."

    edit:
      set status = 'quarantined'
      set quarantine_reason = reason
  }
}
```

Supported `subject` values:

- `single`
- `new`
- `collection`

The parser should preserve optional subject-body metadata for later use:

```semlang
subject: collection {
  max: 500
  atomic: true
}
```

Fields can be marked `writeable`:

```semlang
field:
  status :: SupplierLotStatus writeable
  quarantine_reason :: QuarantineReason? writeable
```

Fields can provide custom write mappings:

```semlang
field:
  normalized_email :: EmailAddress writeable {
    write: column email_normalized = lower(value)
  }
```

Field write mappings can be multiline:

```semlang
field:
  display_name :: string writeable {
    write:
      column first_name = split_part(value, ' ', 1)
      column last_name = split_part(value, ' ', 2)
  }
```

Raw SQL assignment fragments are allowed in write mappings:

```semlang
field:
  email_search :: string writeable {
    write: sql "email_search_vector = to_tsvector('english', {value})"
  }
```

Dimensions can be marked writeable only when they include a write mapping:

```semlang
dimension:
  full_name is concat(first_name, ' ', last_name) writeable {
    write:
      column first_name = split_part(value, ' ', 1)
      column last_name = split_part(value, ' ', 2)
  }
```

## AST and Semantic Model Requirements

Add action declarations to concept members and resolved concepts.

Each action should preserve:

- name
- description, if present
- subject mode and subject metadata
- parameters with name, semantic type, nullability, default expression, hidden flag, and location
- guards with predicate, optional `else` message, and location
- edits with `set` assignments, `insert` assignments, or `delete` markers and locations
- log block as structured metadata or preserved lines
- effect blocks as structured metadata or preserved lines
- agent metadata as key/value entries

Each field should preserve:

- `writeable: boolean`
- zero or more write mappings

Each dimension should preserve:

- `writeable: boolean`
- zero or more write mappings

Write mappings should distinguish:

- default mapping, implied by source-backed writeable fields
- `column <physical_name> = <expression>`
- `sql "<assignment fragment>"`

## Validation Requirements

The first implementation should diagnose:

- duplicate action names within a concept
- missing `subject`
- invalid `subject` value
- unresolved parameter type
- duplicate parameter names within an action
- `set` assignment to an unknown member
- `set` assignment to a non-writeable member
- `set` assignment to a measure, join, role, validation, or view
- `insert` used outside `subject: new`
- `delete` used with `subject: new`
- `set` used in `subject: new` before a supported subject binding exists
- `writeable` dimension without an explicit write mapping
- raw SQL write mappings that look like full statements rather than assignment fragments

Recommended diagnostic codes:

- `DUPLICATE_ACTION`
- `MISSING_ACTION_SUBJECT`
- `INVALID_ACTION_SUBJECT`
- `UNRESOLVED_ACTION_PARAM_TYPE`
- `DUPLICATE_ACTION_PARAM`
- `UNKNOWN_ACTION_TARGET`
- `NON_WRITEABLE_ACTION_TARGET`
- `INVALID_ACTION_EDIT`
- `WRITEABLE_DIMENSION_REQUIRES_MAPPING`
- `INVALID_WRITE_MAPPING`

Validation can defer expression type-checking for guard predicates, edit expressions, write expressions, and agent metadata. Those expressions should still be preserved exactly enough for a future manifest emitter.

## Lowering Requirements

Malloy emission must ignore actions and write mappings. Existing Malloy output for read models should remain stable except for harmless formatting changes around parsed declarations.

The MCP `invoke_action` adapter may lower supported actions to SQL through the configured Malloy connection. SQL action lowering must remain separate from Malloy read/query lowering, avoid dialect-specific `RETURNING`, `UPDATE ... FROM`, and `DELETE ... USING` constructs in the default path, quote schema-qualified table path components separately, and reject write selectors that can fan out one subject identity into multiple rows.

The first implementation does not need to expose a public action manifest emitter, but the AST and semantic model should be structured so a manifest emitter can be added without reparsing action bodies.

## Test Requirements

Add focused tests for:

- parsing a concept-local `action` with `subject`, `param`, `guard`, and `edit`
- parsing `writeable` fields with default writeback semantics
- parsing custom `column` and `sql` write mappings
- rejecting duplicate action names
- rejecting unresolved parameter types
- rejecting assignment to a non-writeable field
- rejecting a writeable dimension with no mapping
- ensuring Malloy output ignores actions and still emits the concept source

Update fixture examples with realistic actions in at least the manufacturing, retail, healthcare, banking, and SaaS examples. Examples should compile without diagnostics.
