---
title: Lens Tools
sidebar_position: 5
---

# Lens Detail

Lens capabilities are exposed through the consolidated `search` and `describe` tools.
Use `search` to discover candidate lenses for a question, and use `describe` to inspect, expand, audit required fields, or plan lens application before validating queries.

## Discover Lenses

Call `search` with a question or context phrase to score lenses against the user's goal.

### Inputs

| Field   | Type   | Notes                                |
| ------- | ------ | ------------------------------------ |
| `query` | string | Question or context phrase.          |
| `kind`  | string | Use `lens` for lens-only results.    |
| `limit` | number | Maximum results per result category. |

### Output

Returns scored lenses with description, parents, refined concepts, score, and matched terms.

## Describe Lenses

Call `describe` with `kind: "lens"` to describe a lens or lens stack.

### Inputs

| Field   | Type         | Notes                  |
| ------- | ------------ | ---------------------- |
| `kind`  | string       | Use `lens`.            |
| `names` | string array | Lens names to inspect. |

### Output

Returns the lens name, parent lenses, description, declared types, and refinements.

## Expand Lenses

Call `describe` with `kind: "lens"` and `operation: "expand"` to apply one or more lenses and summarize the expanded model.

### Inputs

| Field       | Type         | Notes                                  |
| ----------- | ------------ | -------------------------------------- |
| `kind`      | string       | Use `lens`.                            |
| `operation` | string       | Use `expand`.                          |
| `names`     | string array | Lens names plus optional root concept. |

### Output

Returns diagnostics, an expanded model summary, and refinements from the requested lenses.
If expansion fails, the response includes diagnostics and an error.

## Required Fields

Call `describe` with `kind: "lens"` and `operation: "required_fields"` to report fields exposed by lens refinements and fields referenced by lens expressions.

### Inputs

| Field       | Type         | Notes                               |
| ----------- | ------------ | ----------------------------------- |
| `kind`      | string       | Use `lens`.                         |
| `operation` | string       | Use `required_fields`.              |
| `names`     | string array | Optional lens filters.              |
| `fields`    | string array | Optional requested fields to match. |

### Output

Returns one entry per selected lens refinement.
Each entry includes exposed fields, expression text, required expression fields, and field-specific matches when `field` or `fields` is provided.

### Example

```json
{
  "fields": ["contact_email", "phone_number", "customer_contact_email"]
}
```

## Lens Plans

Call `describe` with `kind: "lens"` and `operation: "plan"` to plan lens application for a question or explicit lens list.

### Inputs

| Field       | Type         | Notes                           |
| ----------- | ------------ | ------------------------------- |
| `kind`      | string       | Use `lens`.                     |
| `operation` | string       | Use `plan`.                     |
| `question`  | string       | Question or goal text.          |
| `names`     | string array | Explicit lens stack to include. |

### Output

Returns described lenses and ordered steps.
Each step includes parent lenses to apply first, affected concepts, and added semantic types.

### Example

```json
{
  "question": "regulatory CRE watchlist queue",
  "names": ["regulatory_base_reporting", "commercial_real_estate_concentration", "watchlist_credit_review"]
}
```
