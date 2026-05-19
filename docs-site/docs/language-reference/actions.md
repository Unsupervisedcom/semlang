---
title: Actions
sidebar_position: 6
---

Actions describe permitted write operations on ontology objects. They are concept-local because every action has a subject: an existing object, a new object of the owning concept, or a collection of owning-concept objects.

OntoQL still lowers analytical reads to Malloy. Actions lower to a separate action manifest for a runtime adapter, API gateway, MCP server, or app surface that can validate parameters, evaluate guards, perform writes, and record an action log.

## Concept-Local Actions

Declare actions inside the concept they act on:

```ontoql
concept SupplierLot is kind from duckdb.table('supplier_lots') {
  identity supplier_lot_id :: SupplierLotId

  field:
    status :: SupplierLotStatus writeable
    quarantine_reason :: QuarantineReason? writeable
    quarantined_at :: EventTimestamp? writeable

  action quarantine {
    subject: single

    param:
      reason :: QuarantineReason

    guard:
      this.status in ['received', 'released']
        else "Only received or released lots can be quarantined."

    edit:
      set status = 'quarantined'
      set quarantine_reason = reason
      set quarantined_at = current_time

    log as SupplierLotActionLog {
      summary: "Quarantined ${this.supplier_lot_id}"
      include: reason, current_user.id
    }
  }
}
```

The implicit `this` binding is the subject object for `subject: single` and each item under evaluation for `subject: collection`. For `subject: new`, `this` is bound by the `insert` edit.

## Subject

An action must declare one subject mode:

```ontoql
subject: single
subject: new
subject: collection
```

`single` means the action targets one existing object of the owning concept. `new` means the action creates one object of the owning concept. `collection` means the action targets a list of existing owning-concept objects.

Collection subjects can add execution semantics:

```ontoql
subject: collection {
  max: 500
  atomic: true
}
```

`atomic: true` means all items commit or none commit. `atomic: false` allows per-item success and failure reporting.

## Parameters

Action parameters use the same semantic types as fields:

```ontoql
type: QuarantineReason is string {
  minLength: 10
  maxLength: 500
}

type: HoldPriority is string {
  enum: ['low', 'medium', 'high', 'critical']
}

// Excerpt from a concept-local action body.
action quarantine {
  subject: single

  param:
    reason :: QuarantineReason
    priority :: HoldPriority default 'medium'
    notify_supplier :: boolean default true
}
```

The action manifest exports parameter schemas using the JSON Schema metadata declared on semantic types. Action-local parameter metadata can refine the type when needed, but it cannot relax the named type.

## Guards

Guards are submission criteria. They must be true before the edit plan can run:

```ontoql
guard:
  this.status in ['received', 'released']
    else "Only received or released lots can be quarantined."

  current_user has role QualityManager
    else "Only quality managers can quarantine lots."
```

Guards can reference `this`, parameters, fields, dimensions, joins, roles, and user context exposed by the runtime. For `subject: collection`, guards are evaluated for each item unless the guard is explicitly marked as collection-level by the runtime manifest.

## Writeable Fields and Dimensions

Only declarations marked `writeable` can be assigned by an action.

```ontoql
field:
  status :: SupplierLotStatus writeable
```

For a source-backed field, `writeable` implies the default write implementation:

```ontoql
write: column status = value
```

where `status` is both the semantic field name and the physical column name. The runtime owns the `UPDATE`, `WHERE`, transaction, parameter binding, and authorization checks.

Derived dimensions are not writeable unless they declare an explicit write mapping:

```ontoql
dimension:
  full_name is concat(first_name, ' ', last_name) writeable {
    write:
      column first_name = split_part(value, ' ', 1)
      column last_name = split_part(value, ' ', 2)
  }
```

`value` is the value assigned by the action. The compiler rejects assignments to non-writeable fields, derived dimensions without write mappings, measures, joins, roles, and aggregate values.

## Custom Write Mappings

Use field-local write mappings when the semantic field does not write to a same-named physical column.

Portable mappings use `column` assignments:

```ontoql
field:
  normalized_email :: EmailAddress writeable {
    write: column email_normalized = lower(value)
  }
```

Mappings may fan out to several assignments:

```ontoql
field:
  display_name :: string writeable {
    write:
      column first_name = split_part(value, ' ', 1)
      column last_name = split_part(value, ' ', 2)
  }
```

Dialect-specific mappings can use raw SQL assignment fragments:

```ontoql
field:
  email_search :: string writeable {
    write: sql "email_search_vector = to_tsvector('english', {value})"
  }
```

Raw SQL write mappings are assignment fragments, not full statements. The runtime must parameterize `{value}` and must not string-interpolate user input.

## Edits

The `edit:` block declares the semantic change plan:

```ontoql
edit:
  set status = 'quarantined'
  set quarantine_reason = reason
  set quarantined_at = current_time
```

For `subject: single`, `set field = expression` assigns a writeable member on `this`. For `subject: new`, use `insert`:

```ontoql
concept RecallCampaign is kind from duckdb.table('recall_campaigns') {
  action create {
    subject: new

    param:
      title :: RecallCampaignTitle
      severity :: SeverityLevel

    edit:
      insert {
        title: title
        severity: severity
        status: 'draft'
        created_at: current_time
        created_by: current_user.id
      }
  }
}
```

Future action versions can add `create`, `delete`, `link`, and `unlink` edits for secondary objects, but V1 should start with `set` and owning-concept `insert`.

## Side Effects and Logs

Side effects are declared separately from writes:

```ontoql
effect after_commit:
  notify this.supplier.account_owner {
    when: notify_supplier
    subject: "Supplier lot quarantined"
  }
```

`before_commit` effects can block the transaction. `after_commit` effects run after durable writes and are logged independently.

Action logs describe the audit object emitted by the runtime:

```ontoql
log as SupplierLotActionLog {
  summary: "Quarantined ${this.supplier_lot_id}"
  include: reason, current_user.id
}
```

The manifest should include action name, owning concept, subject mode, version, user, timestamp, parameter values, edited identities, guard outcomes, write results, and side-effect results.

## Planned Raw SQL Execution Escape Hatch

V1 supports raw SQL only in field or dimension write mappings, where the SQL is an assignment fragment such as `email_search_vector = to_tsvector('english', {value})`.

A future action version may support whole-action raw SQL execution as an explicit escape hatch:

```ontoql
action quarantine {
  subject: single

  execute sql on operational_db """
    update supplier_lots
    set status = 'quarantined',
        quarantine_reason = {{ reason }},
        quarantined_at = {{ current_time }}
    where supplier_lot_id = {{ this.supplier_lot_id }}
  """

  declares_write:
    SupplierLot.status
    SupplierLot.quarantine_reason
    SupplierLot.quarantined_at
}
```

When this is added, raw execution blocks must declare their semantic write scope so agents, reviewers, audit tools, and policy checks can reason about the change. Whole-action raw SQL execution is not part of the first parser and validation slice.

## Agent Exposure

Actions can opt into agent/tool surfaces:

```ontoql
agent:
  expose: true
  risk: high
  requires_confirmation: true
  idempotency_key: concat('quarantine:', this.supplier_lot_id)
```

Agent metadata is not authorization. It tells tool surfaces how to present the action, whether confirmation is required, and how to avoid accidental duplicate submissions.

## Lowering

Actions do not lower to Malloy. The compiler emits Malloy for reads and an action manifest for writes:

```text
OntoQL
  -> semantic model
  -> Malloy read model
  -> action manifest
```

The action manifest contains the parameter JSON Schema, subject mode, guards, writable-member mappings, edit plan, side-effect plan, log configuration, and agent metadata. Runtime adapters turn the manifest into SQL, API calls, queue messages, or other write mechanisms.
