---
title: Reasoning Tools
sidebar_position: 7
---

# Reasoning Tools

Reasoning tools provide high-level hints that help an agent choose a semantic route before it commits to a query plan.

## `reasoning.derive`

Derives candidate concepts, metrics, lenses, and path hints for a question.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `question` | string | Preferred analytical question. |
| `goal` | string | Alias for `question`. |
| `text` | string | Alias for `question`. |

### Output

Returns:

- `candidateConcepts`: concept search matches from `semantic.search_terms`.
- `candidateMetrics`: measure matches from `semantic.search_terms`.
- `candidateLenses`: scored lens matches.
- `pathHints`: short join paths between the top candidate concepts.
- `derivation`: notes describing the heuristic used.

### Example

```json
{
  "question": "recognized revenue ARR movement subscription product usage"
}
```

Use `reasoning.derive` as a planning shortcut. Use the more specific ontology, lens, and query tools to verify any candidate before generating or running a query.
