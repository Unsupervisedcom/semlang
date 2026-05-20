---
title: Lens Tools
sidebar_position: 5
---

# Lens Tools

Lens tools help agents choose, inspect, apply, and audit SemLang lens overlays before validating queries.

## `lens.suggest`

Scores lenses against a user question or context phrase.

### Inputs

| Field          | Type   | Notes                                |
| -------------- | ------ | ------------------------------------ |
| `user_context` | string | Preferred context text.              |
| `context`      | string | Alias for `user_context`.            |
| `question`     | string | Alias for `user_context`.            |
| `phrase`       | string | Alias for `user_context`.            |
| `text`         | string | Alias for `user_context`.            |
| `limit`        | number | Maximum lens results. Defaults to 8. |

### Output

Returns scored lenses with description, parents, refined concepts, score, and matched terms.

## `lens.describe`

Describes one lens.

### Inputs

| Field  | Type   | Notes             |
| ------ | ------ | ----------------- |
| `lens` | string | Lens name.        |
| `name` | string | Alias for `lens`. |

### Output

Returns the lens name, parent lenses, description, declared types, and refinements.

## `lens.expand`

Applies one or more lenses and summarizes the expanded model.

### Inputs

| Field     | Type         | Notes                                |
| --------- | ------------ | ------------------------------------ |
| `lens`    | string       | Lens name.                           |
| `lenses`  | string array | Lens stack to apply.                 |
| `name`    | string       | Alias for `lens`.                    |
| `root`    | string       | Optional root concept for expansion. |
| `concept` | string       | Alias for `root`.                    |

### Output

Returns diagnostics, an expanded model summary, and refinements from the requested lenses. If expansion fails, the response includes diagnostics and an error.

## `lens.required_fields`

Reports fields exposed by lens refinements and fields referenced by lens expressions. This is useful when an agent needs to determine which lens grants access to sensitive, role-specific, or derived fields.

### Inputs

| Field    | Type         | Notes                               |
| -------- | ------------ | ----------------------------------- |
| `lens`   | string       | Optional lens filter.               |
| `lenses` | string array | Optional lens filters.              |
| `name`   | string       | Alias for `lens`.                   |
| `field`  | string       | Optional requested field to match.  |
| `fields` | string array | Optional requested fields to match. |

### Output

Returns one entry per selected lens refinement. Each entry includes exposed fields, expression text, required expression fields, and field-specific matches when `field` or `fields` is provided.

### Example

```json
{
  "fields": ["contact_email", "phone_number", "customer_contact_email"]
}
```

## `lens.plan`

Plans lens application for a question or explicit lens list.

### Inputs

| Field      | Type         | Notes                           |
| ---------- | ------------ | ------------------------------- |
| `question` | string       | Question or goal text.          |
| `goal`     | string       | Alias for `question`.           |
| `phrase`   | string       | Alias for `question`.           |
| `text`     | string       | Alias for `question`.           |
| `lens`     | string       | Explicit lens to include.       |
| `lenses`   | string array | Explicit lens stack to include. |

### Output

Returns described lenses and ordered steps. Each step includes parent lenses to apply first, affected concepts, and added semantic types.

### Example

```json
{
  "question": "regulatory CRE watchlist queue",
  "lenses": ["regulatory_base_reporting", "commercial_real_estate_concentration", "watchlist_credit_review"]
}
```
