---
title: Query and Action Tools
sidebar_position: 6
---

# Query and Action Tools

`run_query` validates and runs SemLang queries.
`invoke_action` invokes supported action edits through the configured Malloy connection.

## `run_query`

Validates a named query, full query declaration, or temporary query body against the current ontology and executes it through the Malloy SDK unless `dry_run_only` is true.

### Inputs

| Field                 | Type                   | Notes                                                                         |
| --------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `query`               | string                 | Named query, full `query:` declaration, or query body text.                   |
| `name`                | string                 | Alias for a named query, or the temporary query name when a body is supplied. |
| `queryName`           | string                 | Temporary query name. Defaults to `__mcp_query`.                              |
| `root`                | string                 | Root concept for a temporary query.                                           |
| `concept`             | string                 | Alias for `root`.                                                             |
| `source`              | string                 | Alias for `root`.                                                             |
| `lens`                | string                 | Lens to apply to a temporary query.                                           |
| `lenses`              | string array           | Lens stack to apply to a temporary query.                                     |
| `with`                | string or string array | Alias for `lenses`.                                                           |
| `body`                | string or object       | Temporary query body.                                                         |
| `queryBody`           | string or object       | Alias for `body`.                                                             |
| `where`               | string                 | Query body filter.                                                            |
| `select`              | string or string array | Query body select items.                                                      |
| `groupBy`             | string or string array | Query body group items.                                                       |
| `group_by`            | string or string array | Alias for `groupBy`.                                                          |
| `aggregate`           | string or string array | Query body aggregate items.                                                   |
| `calculate`           | string or string array | Query body calculate items.                                                   |
| `orderBy`             | string or string array | Query body ordering.                                                          |
| `order_by`            | string or string array | Alias for `orderBy`.                                                          |
| `limit`               | number                 | Query body limit.                                                             |
| `dry_run_only`        | boolean                | Validate and return query Malloy without executing. Defaults to false.        |
| `dryRunOnly`          | boolean                | Alias for `dry_run_only`.                                                     |
| `query_limit_seconds` | integer                | Required positive execution limit, in seconds, unless `dry_run_only` is true. |
| `queryLimitSeconds`   | integer                | Alias for `query_limit_seconds`.                                              |
| `rowLimit`            | integer                | Optional maximum rows to request from Malloy execution.                       |

### Output

For named queries, returns the resolved query, diagnostics, extracted `queryMalloy`, and an `execution` object.
For temporary queries, returns the generated query name, root, lenses, diagnostics, extracted `queryMalloy`, and `execution`.
When `dry_run_only` is true, `execution` is present with `skipped: true`, `execution.ok` is omitted, and `query_limit_seconds` is not required.
The full compiled Malloy model is not returned by `run_query`; request it from `load_ontology` with `return_malloy_model` when debugging the whole generated model.

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

Execution uses the Malloy config context captured by `load_ontology`.
Named queries and temporary root/body queries are both eligible for execution.
If the loaded SemLang config does not identify a Malloy config, execution fails with a clear setup error.
If execution exceeds `query_limit_seconds`, SemLang terminates the isolated Malloy execution worker and returns a timeout result.

Custom connection names such as `warehouse.table('analytics.orders')` must be present in Malloy config.
If a model references an unknown custom connection, `run_query` returns a clear Malloy execution error naming the missing connection.
See [Malloy Connections](./malloy-connections.md).

### Execution Results

| Field                         | Meaning                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `execution.ok`                | Whether Malloy execution succeeded.                             |
| `execution.execution_time_ms` | Wall-clock elapsed execution time in milliseconds.              |
| `execution.rows`              | JSON rows returned by the configured connection.                |
| `execution.export_path`       | Path to exported JSON rows when output is larger than 10 lines. |
| `execution.row_count`         | Number of rows returned inline or written to the export file.   |
| `execution.error`             | Clear error text when Malloy compilation or execution fails.    |

Default successful responses omit verbose execution internals including generated SQL, execution engine name, query name, query limit, and success-path timeout flags.

## `invoke_action`

Invokes a supported action by generating SQL and executing it with the ontology's configured Malloy connection.
Generated write SQL avoids `RETURNING`, `UPDATE ... FROM`, and `DELETE ... USING` so the core lowering can run on more Malloy-backed SQL engines.

### Inputs

| Field                 | Type    | Notes                                                                                          |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `action`              | string  | Action name.                                                                                   |
| `concept`             | string  | Optional concept name. Required when the action name is ambiguous.                             |
| `target`              | object  | Subject identity fields, `id`, or `where` predicate for the action subject.                    |
| `params`              | object  | Action parameter values.                                                                       |
| `dry_run_only`        | boolean | Generate SQL without executing it. Defaults to false.                                          |
| `query_limit_seconds` | integer | Optional positive execution deadline for generated SQL. Defaults to 30 seconds when executing. |

### Supported Actions

`invoke_action` currently supports:

- `subject: single` and `subject: collection` actions with `set` edits.
- `subject: single` and `subject: collection` actions with `delete` edits.
- `subject: new` actions with `insert` edits.
- Default, `column`, and raw SQL assignment-fragment write mappings.

The invoker skips or rejects unsupported edit kinds, malformed raw SQL write mappings, missing required params, non-table-backed concepts, and actions whose subject mode is not supported.

### Output

Returns the resolved concept and action, generated SQL, changed row count, selected affected rows, diagnostics, timeout metadata (`query_limit_seconds`, `timed_out`), and a verification query when available.
Use `dry_run_only: true` to return generated SQL without execution.

### Example

```json
{
  "concept": "ReturnLine",
  "action": "settle_return",
  "target": {
    "return_line_id": "RET_50002_1"
  },
  "params": {
    "approved_refund_amount": 121.25,
    "approved_restocking_fee_amount": 4.5
  }
}
```
