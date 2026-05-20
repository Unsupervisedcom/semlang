---
title: Query and Action Tools
sidebar_position: 6
---

# Query and Action Tools

Query tools validate and run SemLang queries. Action tools invoke supported local action edits against example DuckDB data.

## `query.validate`

Validates a named query, full query declaration, or temporary query body against the current ontology.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `query` | string | Named query, full `query:` declaration, or query body text. |
| `name` | string | Alias for a named query, or the temporary query name when a body is supplied. |
| `queryName` | string | Temporary query name. Defaults to `__mcp_query`. |
| `root` | string | Root concept for a temporary query. |
| `concept` | string | Alias for `root`. |
| `source` | string | Alias for `root`. |
| `lens` | string | Lens to apply to a temporary query. |
| `lenses` | string array | Lens stack to apply to a temporary query. |
| `with` | string or string array | Alias for `lenses`. |
| `body` | string or object | Temporary query body. |
| `queryBody` | string or object | Alias for `body`. |
| `where` | string | Query body filter. |
| `select` | string or string array | Query body select items. |
| `groupBy` | string or string array | Query body group items. |
| `group_by` | string or string array | Alias for `groupBy`. |
| `aggregate` | string or string array | Query body aggregate items. |
| `calculate` | string or string array | Query body calculate items. |
| `orderBy` | string or string array | Query body ordering. |
| `order_by` | string or string array | Alias for `orderBy`. |
| `limit` | number | Query body limit. |

### Output

For named queries, returns the resolved query and diagnostics. For temporary queries, returns the generated query name, root, lenses, diagnostics, and validation status. `query.validate` removes generated Malloy fields from the response.

### Examples

```json
{
  "query": "monthly_margin_and_returns"
}
```

```json
{
  "root": "SaleLine",
  "group_by": ["sold_at.month is sold_at.month", "store.region"],
  "aggregate": ["net_sales", "settled_refund_amount"]
}
```

## `query.run`

Validates a query and then attempts local execution against DuckDB example data.

### Inputs

Accepts the same query inputs as `query.validate`.

### Output

Returns validation fields plus generated `malloy`, extracted `queryMalloy`, and an `execution` object.

Execution succeeds only for named queries from the current ontology when the loaded source file has sibling `schema.sql` and `sample_data.sql` files. Lens-expanded query execution is currently skipped, but the tool still returns lens-local Malloy.

### Execution Results

| Field | Meaning |
| --- | --- |
| `execution.ok` | Whether DuckDB execution succeeded. |
| `execution.engine` | `duckdb` when execution ran. |
| `execution.sql` | SQL lowered from the named query for local execution. |
| `execution.rows` | JSON rows returned by DuckDB. |
| `execution.skipped` | Present when execution could not run locally. |
| `execution.reason` | Explanation for skipped execution. |

## `action.invoke`

Invokes a supported action against local DuckDB example data.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `action` | string | Action name. |
| `name` | string | Alias for `action`. |
| `concept` | string | Optional concept name. Required when the action name is ambiguous. |
| `subject` | object | Subject identity or field predicates. |
| `id` | string or number | Shortcut for the first identity field on `subject: single` actions. |
| `where` | string | Raw subject predicate for `subject: single` actions. |
| `params` | object | Action parameter values. |
| Action parameter names | any | Parameters may also be passed as top-level fields. |

### Supported Actions

`action.invoke` currently supports:

- `subject: single` actions with `set` edits.
- `subject: new` actions with `insert` edits.
- Default and `column` write mappings.

The local invoker skips or rejects unsupported edit kinds, raw SQL write mappings, missing required params, non-table-backed concepts, and actions whose subject mode is not supported.

### Output

Returns the resolved concept and action, generated SQL, changed row count, returned rows, diagnostics, and a verification query when available. If local example data is unavailable, the response is skipped with a reason.

### Example

```json
{
  "concept": "ReturnLine",
  "action": "settle_return",
  "subject": {
    "return_line_id": "RET_50002_1"
  },
  "params": {
    "approved_refund_amount": 121.25,
    "approved_restocking_fee_amount": 4.5
  }
}
```
