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

There are two different names involved:

- The **connection name** appears in SemLang and Malloy source text, such as `warehouse.table(...)`.
- The **connection type** appears in Malloy config, such as `"is": "databricks"` or `"is": "duckdb"`.

The connection name does not need to match the backend type. Prefer stable project names such as `warehouse`, `analytics`, or `finance` when the same model might move between engines.

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

Built-in default-looking names such as `duckdb` are fine when Malloy can create or discover those connections. Custom names such as `warehouse`, `prod_bq`, or `finance_pg` must be present in Malloy configuration.

## Project Config

For shared projects, either pass an explicit config path to `set_ontology_source` or use Malloy's conventional config filenames.

An explicit `configPath` / `malloyConfigPath` may point at any JSON config file:

```json
{
  "path": "models/orders.semlang",
  "configPath": "config/databricks-malloy.json"
}
```

When no explicit config path is supplied, SemLang MCP auto-discovers `malloy-config-local.json` or `malloy-config.json` by walking up from the SemLang model file. If it finds no config, `set_ontology_source` fails with a setup error instead of silently falling back to another engine. The filename is only magic for this auto-discovery path.

```json
{
  "connections": {
    "warehouse": {
      "is": "duckdb",
      "databasePath": "./data/warehouse.duckdb",
      "workingDirectory": { "config": "rootDirectory" },
      "shareable": true
    },
    "databricks_warehouse": {
      "is": "databricks",
      "host": "dbc-00000000-0000.cloud.databricks.com",
      "path": "/sql/1.0/warehouses/0000000000000000",
      "token": { "env": "DATABRICKS_TOKEN" },
      "defaultCatalog": "main",
      "defaultSchema": "analytics"
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

## Engine Packages

Malloy's SDK needs a connection package loaded for each configured connection type. SemLang MCP currently registers:

| Config `is` value | Package loaded by SemLang MCP  |
| ----------------- | ------------------------------ |
| `duckdb`          | `@malloydata/db-duckdb/native` |
| `databricks`      | `@malloydata/db-databricks`    |

If `malloy-config.json` uses a connection type that SemLang MCP does not yet register, `query.run` fails before execution with an error naming the missing type. Adding a new engine is a SemLang MCP code/dependency change; changing connection names or credentials is project configuration.

Do not rewrite every SemLang model from `duckdb.table(...)` to `databricks.table(...)` just because the deployment target is Databricks. Update source declarations only when the connection name or table path should change. A model can use `warehouse.table('main.analytics.orders')` while config maps `warehouse` to `"is": "databricks"`.

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

Configure and start `semlang mcp` as usual, then load a SemLang file that uses the same connection names:

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

`query.run` requires the Malloy config captured by `set_ontology_source`. For custom names such as `warehouse`, add the connection to an explicit config file or to a discovered `malloy-config-local.json` / `malloy-config.json` before loading the ontology.

## Troubleshooting

| Symptom                                                                  | Check                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set_ontology_source` says no Malloy config file was found               | Pass `configPath` / `malloyConfigPath`, or add `malloy-config-local.json` or `malloy-config.json` at or above the SemLang model directory.               |
| `Source expression ... is missing a named Malloy connection`             | Change `table('orders')` to `connection_name.table('orders')` or define a named SemLang `source:` that uses a connection.                                |
| Malloy says the connection is unknown                                    | Add the same connection name to `malloy-config.json`, `malloy-config-local.json`, or global Malloy config.                                               |
| SemLang MCP says a connection type is configured but no package is known | The project config uses an engine that `src/malloy-execution.ts` does not register yet; add the relevant `@malloydata/db-*` dependency and registration. |
| Databricks config loads but table resolution fails                       | Check that the SemLang table path uses Databricks path rules: `table`, `schema.table`, or `catalog.schema.table`.                                        |
| DuckDB relative paths resolve differently for the agent                  | Set `workingDirectory` in the DuckDB connection, preferably to `{ "config": "rootDirectory" }` for project-local config.                                 |
| A DuckDB file is locked by another process                               | For read-heavy shared files, set `readOnly: true`; when tools need to take turns with a writable file, set `shareable: true`.                            |
| Secret values are missing                                                | Make sure the MCP host process receives the environment variables referenced by config entries such as `{ "env": "FINANCE_PG_PASSWORD" }`.               |

See the Malloy documentation for [connection syntax](https://docs.malloydata.dev/documentation/language/connections), [database support](https://docs.malloydata.dev/documentation/setup/database_support), [CLI connection commands](https://docs.malloydata.dev/documentation/setup/cli), and the [`malloy-config.json` format](https://docs.malloydata.dev/documentation/setup/config).
