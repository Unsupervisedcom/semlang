---
title: Malloy Connections
sidebar_position: 7
---

# Malloy Connections

SemLang source declarations use Malloy connection syntax, and the MCP server preserves those connection names when it compiles a model. A source such as `warehouse.table('analytics.orders')` means:

- `warehouse` is the Malloy connection name.
- `table('analytics.orders')` is the table path Malloy will resolve for that connection type.
- SemLang validates the shape and emits the connection-qualified Malloy source unchanged.

The compiler preserves connection-qualified source expressions; MCP query execution uses Malloy config captured when the ontology source is loaded. SemLang still requires connection names in source declarations and does not invent a connection for unqualified `table(...)` calls.

## Choose Connection Names

Use the exact connection name that Malloy will know at execution time:

```semlang
concept Order is event from warehouse.table('analytics.orders') {
  identity order_id :: string
}
```

```semlang
source: recent_orders is warehouse.sql("""
  select *
  from analytics.orders
  where created_at >= current_date - interval '30 day'
""")
```

Built-in default-looking names such as `duckdb`, `bigquery`, `postgres`, and `snowflake` are fine when Malloy can create or discover those connections. Custom names such as `warehouse`, `prod_bq`, or `finance_pg` must be present in Malloy configuration.

## Project Config

For shared projects, add `malloy-config.json` at the project root or above the SemLang model files. Malloy discovers this file by walking up from the Malloy file or project directory.

```json
{
  "connections": {
    "warehouse": {
      "is": "duckdb",
      "databasePath": "./data/warehouse.duckdb",
      "workingDirectory": { "config": "rootDirectory" },
      "shareable": true
    },
    "prod_bq": {
      "is": "bigquery",
      "projectId": "analytics-prod",
      "location": "US"
    },
    "finance_pg": {
      "is": "postgres",
      "host": "db.example.com",
      "port": 5432,
      "username": "readonly",
      "databaseName": "finance",
      "password": { "env": "FINANCE_PG_PASSWORD" }
    }
  }
}
```

Use `malloy-config-local.json` for developer-specific credentials or local file paths, and add it to `.gitignore`:

```gitignore
malloy-config-local.json
```

Malloy merges `malloy-config-local.json` with the sibling `malloy-config.json`, with local connection fields winning on conflicts.

## CLI Setup And Verification

Install the Malloy CLI where the MCP host can run it:

```bash
npm install -g malloy-cli
malloy-cli --help
```

List supported connection types and connection-specific properties:

```bash
malloy-cli connections describe
malloy-cli connections describe duckdb
malloy-cli connections describe postgres
```

Create and test a global connection when you do not want project-local config:

```bash
malloy-cli connections create duckdb warehouse databasePath=/absolute/path/to/warehouse.duckdb
malloy-cli connections test warehouse
```

When testing project-local config, run Malloy from the same project root the agent uses:

```bash
malloy-cli --project-dir /path/to/project connections list
malloy-cli --project-dir /path/to/project connections test warehouse
```

The connection name used in the SemLang model must appear in these commands. If the model says `finance_pg.table('public.invoice')`, test `finance_pg`, not `postgres`.

## MCP Usage

Configure and start `semlang-mcp` as usual, then load a SemLang file that uses the same connection names:

```json
{
  "path": "models/orders.semlang"
}
```

The MCP server can then:

- Validate ontology and query structure against SemLang declarations.
- Capture the Malloy project/config context for later query execution.
- Return generated Malloy containing the configured connection names.
- Execute named or temporary queries through the Malloy SDK.

If no Malloy config is found or supplied, `query.run` uses Malloy's default local `duckdb` connection. For custom names such as `warehouse`, add the connection to `malloy-config.json`, `malloy-config-local.json`, or global Malloy config before running queries.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Source expression ... is missing a named Malloy connection` | Change `table('orders')` to `connection_name.table('orders')` or define a named SemLang `source:` that uses a connection. |
| Malloy says the connection is unknown | Add the same connection name to `malloy-config.json`, `malloy-config-local.json`, or global Malloy config. |
| DuckDB relative paths resolve differently for the agent | Set `workingDirectory` in the DuckDB connection, preferably to `{ "config": "rootDirectory" }` for project-local config. |
| A DuckDB file is locked by another process | For read-heavy shared files, set `readOnly: true`; when tools need to take turns with a writable file, set `shareable: true`. |
| Secret values are missing | Make sure the MCP host process receives the environment variables referenced by config entries such as `{ "env": "FINANCE_PG_PASSWORD" }`. |

See the Malloy documentation for [connection syntax](https://docs.malloydata.dev/documentation/language/connections), [database support](https://docs.malloydata.dev/documentation/setup/database_support), [CLI connection commands](https://docs.malloydata.dev/documentation/setup/cli), and the [`malloy-config.json` format](https://docs.malloydata.dev/documentation/setup/config).
