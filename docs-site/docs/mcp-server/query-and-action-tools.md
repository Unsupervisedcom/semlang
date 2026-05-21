---
title: Query and Action Tools
sidebar_position: 6
---

# Query and Action Tools

Query tools validate and run SemLang queries. Action tools invoke supported local action edits against example DuckDB data.

## `query.validate`

Validates a named query, full query declaration, or temporary query body against the current ontology.

### Inputs

| Field       | Type                   | Notes                                                                         |
| ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| `query`     | string                 | Named query, full `query:` declaration, or query body text.                   |
| `name`      | string                 | Alias for a named query, or the temporary query name when a body is supplied. |
| `queryName` | string                 | Temporary query name. Defaults to `__mcp_query`.                              |
| `root`      | string                 | Root concept for a temporary query.                                           |
| `concept`   | string                 | Alias for `root`.                                                             |
| `source`    | string                 | Alias for `root`.                                                             |
| `lens`      | string                 | Lens to apply to a temporary query.                                           |
| `lenses`    | string array           | Lens stack to apply to a temporary query.                                     |
| `with`      | string or string array | Alias for `lenses`.                                                           |
| `body`      | string or object       | Temporary query body.                                                         |
| `queryBody` | string or object       | Alias for `body`.                                                             |
| `where`     | string                 | Query body filter.                                                            |
| `select`    | string or string array | Query body select items.                                                      |
| `groupBy`   | string or string array | Query body group items.                                                       |
| `group_by`  | string or string array | Alias for `groupBy`.                                                          |
| `aggregate` | string or string array | Query body aggregate items.                                                   |
| `calculate` | string or string array | Query body calculate items.                                                   |
| `orderBy`   | string or string array | Query body ordering.                                                          |
| `order_by`  | string or string array | Alias for `orderBy`.                                                          |
| `limit`     | number                 | Query body limit.                                                             |

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

Validates a query and executes it through the Malloy SDK.

### Inputs

Accepts the same query inputs as `query.validate`, plus the required execution-control parameter
`query_limit_seconds`.

| Field                 | Type    | Notes                                                   |
| --------------------- | ------- | ------------------------------------------------------- |
| `query_limit_seconds` | integer | Required positive query execution limit, in seconds.    |
| `rowLimit`            | integer | Optional maximum rows to request from Malloy execution. |

### Output

Returns validation fields plus generated `malloy`, extracted `queryMalloy`, and an `execution` object.

Execution uses the Malloy project/config context captured by `set_ontology_source`. Named queries and temporary root/body queries are both eligible for execution. If no config was explicitly supplied or discovered, `set_ontology_source` fails before queries are run. If execution exceeds `query_limit_seconds`, SemLang terminates the isolated Malloy execution worker and returns a timeout result.

Custom connection names such as `warehouse.table('analytics.orders')` must be present in Malloy config. If a model references an unknown custom connection, `query.run` returns a clear Malloy execution error naming the missing connection. See [Malloy Connections](./malloy-connections.md).

### Execution Results

| Field                           | Meaning                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `execution.ok`                  | Whether Malloy execution succeeded.                          |
| `execution.engine`              | `malloy` when query execution reached the Malloy SDK.        |
| `execution.query_limit_seconds` | The requested execution limit, in seconds.                   |
| `execution.execution_time_ms`   | Wall-clock elapsed execution time in milliseconds.           |
| `execution.timed_out`           | Whether the execution failed by exceeding the query limit.   |
| `execution.sql`                 | SQL produced by Malloy when available.                       |
| `execution.rows`                | JSON rows returned by the configured connection.             |
| `execution.error`               | Clear error text when Malloy compilation or execution fails. |

## `action.invoke`

Invokes a supported action against local DuckDB example data.

### Inputs

| Field                  | Type             | Notes                                                               |
| ---------------------- | ---------------- | ------------------------------------------------------------------- |
| `action`               | string           | Action name.                                                        |
| `name`                 | string           | Alias for `action`.                                                 |
| `concept`              | string           | Optional concept name. Required when the action name is ambiguous.  |
| `subject`              | object           | Subject identity or field predicates.                               |
| `id`                   | string or number | Shortcut for the first identity field on `subject: single` actions. |
| `where`                | string           | Raw subject predicate for `subject: single` actions.                |
| `params`               | object           | Action parameter values.                                            |
| Action parameter names | any              | Parameters may also be passed as top-level fields.                  |

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
