---
title: Ontology Tools
sidebar_position: 4
---

# Ontology Tools

Ontology tools inspect the compiled SemLang model. Use them after `load_ontology` and before query generation when an agent needs exact semantic structure.

## `describe`

Describes one ontology object or lens-oriented view. This consolidated tool replaces separate concept, action, role, metric, temporal-axis, lens detail, lens expansion, required-field, and lens-plan tools.

### Inputs

| Field       | Type         | Notes                                                                                         |
| ----------- | ------------ | --------------------------------------------------------------------------------------------- |
| `kind`      | string       | Object kind: `concept`, `action`, `role`, `roles`, `metric`, `temporal_axes`, or `lens`.      |
| `operation` | string       | Optional lens operation: `detail`, `expand`, `required_fields`, or `plan`.                    |
| `names`     | string array | Names to describe. For lens expansion, include lens names and optionally a concept root name. |
| `question`  | string       | Optional question for lens planning when no explicit lens names are supplied.                 |
| `fields`    | string array | Optional field names for `operation: "required_fields"`.                                      |

### Output

Concept detail returns source details, identities, fields, joins, roles, dimensions, measures, views, validations, temporal axes, actions, filters, and role base names. Action detail returns subject mode, params, guards, edits, write mappings, logs, effects, agent metadata, and write targets. Role detail returns owning concept, local name, qualified name, label, aliases, and predicate. Metric detail returns matching measures with concept, expression, type name, dependencies, and source location. Temporal-axis detail returns axes with concept name, axis name, expression, and location.

Lens detail returns lens names, parent lenses, descriptions, declared types, and refinements. Lens expansion returns diagnostics, expanded model summary, and refinements. Required-field detail reports fields exposed by lens refinements and fields referenced by lens expressions. Lens plans return described lenses and ordered application steps. When a detail mode receives multiple independent names, the response includes a `results` array with one description result per name.

### Examples

```json
{
  "kind": "concept",
  "names": ["SaleLine"]
}
```

```json
{
  "kind": "lens",
  "operation": "required_fields",
  "names": ["service_returns_pii"]
}
```

## `find_paths`

Finds declared join paths from a source concept or role target to one or more target concepts or role names.

### Inputs

| Field      | Type                   | Notes                                             |
| ---------- | ---------------------- | ------------------------------------------------- |
| `from`     | string                 | Starting concept or role target.                  |
| `source`   | string                 | Alias for `from`.                                 |
| `root`     | string                 | Alias for `from`.                                 |
| `to`       | string or string array | Target concept or role name.                      |
| `target`   | string or string array | Alias for `to`.                                   |
| `maxDepth` | number                 | Search depth, clamped from 1 to 8. Defaults to 4. |
| `depth`    | number                 | Alias for `maxDepth`.                             |

### Output

Returns one result per target plus a flattened `paths` array. Each path includes the concept chain and join steps with join name, kind, target, `on`, and temporal `at` fields.

### Example

```json
{
  "from": "SaleLine",
  "to": ["Store", "ProductSKU", "ReturnLine"]
}
```
