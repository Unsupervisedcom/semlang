---
title: Ontology Tools
sidebar_position: 4
---

# Ontology Tools

Ontology tools inspect the compiled SemLang model. Use them after `set_ontology_source` and before query generation when an agent needs exact semantic structure.

## `ontology.describe_concept`

Describes one concept and its members, optionally after applying lenses.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `concept` | string | Concept name. |
| `name` | string | Alias for `concept`. |
| `lens` | string | Optional lens to apply first. |
| `lenses` | string array | Optional lens stack to apply first. |

### Output

Returns source details, identities, fields, joins, roles, dimensions, measures, views, validations, temporal axes, actions, filters, and role base names.

## `ontology.describe_action`

Describes one action, including subject mode, params, guards, edits, write mappings, logs, effects, and agent metadata.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `action` | string | Action name. |
| `name` | string | Alias for `action`. |
| `concept` | string | Optional concept name. Required when the action name is ambiguous. |

### Output

Returns the resolved action and write targets. When no action is supplied, or a name is ambiguous, the response includes candidates.

## `ontology.describe_role`

Describes a single role by local or qualified role name and optional concept.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `role` | string | Local role name or qualified role name such as `Customer.Active`. |
| `name` | string | Alias for `role`. |
| `concept` | string | Optional owning concept. |

### Output

Returns matching roles with their owning concept, local name, qualified name, label, aliases, and predicate.

## `ontology.describe_roles`

Lists roles across the ontology or on one concept, optionally after applying lenses.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `concept` | string | Optional concept filter. |
| `lens` | string | Optional lens to apply first. |
| `lenses` | string array | Optional lens stack to apply first. |

### Output

Returns all matching role descriptions and the applied lens list.

## `ontology.explain_metric`

Explains measures by name and optional concept.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `metric` | string | Measure name. |
| `measure` | string | Alias for `metric`. |
| `name` | string | Alias for `metric`. |
| `concept` | string | Optional owning concept. |

### Output

Returns matching measures with concept, expression, type name, dependencies, and source location.

## `ontology.describe_temporal_axes`

Lists temporal axes for one concept or the whole ontology.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `concept` | string | Optional concept filter. |
| `name` | string | Alias for `concept`. |

### Output

Returns axes with concept name, axis name, expression, and location.

## `ontology.find_paths`

Finds declared join paths from a source concept or role target to one or more target concepts or role names.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `from` | string | Starting concept or role target. |
| `source` | string | Alias for `from`. |
| `root` | string | Alias for `from`. |
| `to` | string or string array | Target concept or role name. |
| `target` | string or string array | Alias for `to`. |
| `maxDepth` | number | Search depth, clamped from 1 to 8. Defaults to 4. |
| `depth` | number | Alias for `maxDepth`. |

### Output

Returns one result per target plus a flattened `paths` array. Each path includes the concept chain and join steps with join name, kind, target, `on`, and temporal `at` fields.

### Example

```json
{
  "from": "SaleLine",
  "to": ["Store", "ProductSKU", "ReturnLine"]
}
```
