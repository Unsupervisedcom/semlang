---
title: MCP Server
sidebar_position: 1
---

# MCP Server

The SemLang MCP server gives agents tools for semantic discovery, ontology navigation, lens planning, query validation, Malloy-backed query execution, and supported local action invocation.

SemLang models use Malloy-style named connections in source declarations. Configure those connections in Malloy project or global config using the same names referenced by `.semlang` files; see [Malloy Connections](./malloy-connections.md) for setup details.

## Live Source Install

Install the current checkout globally with npm link:

```bash
cd /Users/noah/Documents/semlang2
npm install
npm link
```

This exposes `semlang` anywhere on the machine. The MCP command is intentionally source-backed: every MCP process starts through the checked-out TypeScript source with the repo-local `tsx`, so new agents pick up code changes without waiting for a build. Restart an already-running MCP session to load edits made after it started.

## Project Configuration

Add a project-local MCP config that points at the global command:

```json
{
  "mcpServers": {
    "semlang": {
      "command": "semlang",
      "args": ["mcp"]
    }
  }
}
```

Agents should load the relevant model with `set_ontology_source` before using ontology or query tools:

```json
{
  "path": "examples/retail-omnichannel-margin-and-returns/example.semlang"
}
```

Relative model paths are resolved from the agent project's working directory, not from the SemLang repo.

Managed settings may be supplied with CLI parameters on the Commander-backed `semlang setup` and `semlang mcp` commands. The `project-dir` option defaults to the current directory where `semlang mcp` is run, and the `export-directory` option defaults to the operating system temp directory.

Any MCP parameter can also be set with a `SEMLANG_`-prefixed environment variable by uppercasing the option name and replacing separators with underscores; for example, `SEMLANG_PROJECT_DIR=/path/to/project semlang mcp` sets `--project-dir`.

```bash
semlang setup --project-dir /path/to/project --malloy-config-path /path/to/malloy-config.json --export-directory /path/to/exports
semlang mcp --project-dir /path/to/project --malloy-config-path /path/to/malloy-config.json --export-directory /path/to/exports
```

MCP client configuration can usually rely on those defaults:

```json
{
  "mcpServers": {
    "semlang": {
      "command": "semlang",
      "args": ["mcp"]
    }
  }
}
```

If your MCP client does not start in the project directory, pass `--project-dir`. If your Malloy config or export location is outside the defaults, pass `--malloy-config-path` or `--export-directory`.

`query.run` returns a transaction GUID for tracing. If executed row output is larger than 10 lines, SemLang writes the rows to `<export-directory>/<transaction-guid>.json` and returns that path instead of inline rows.

## Tool Surface

Common tools include:

- `set_ontology_source` compiles one or more SemLang files into the MCP context.
- `semantic.search_terms` finds relevant concepts, fields, metrics, queries, lenses, and actions.
- `catalog.resolve_entity` resolves ontology names and, when local DuckDB example data is available, business labels.
- `ontology.describe_concept` explains a concept and its semantic members.
- `ontology.describe_action`, `ontology.describe_role`, `ontology.describe_roles`, `ontology.explain_metric`, and `ontology.describe_temporal_axes` expose focused ontology details.
- `ontology.find_paths` finds join paths between concepts.
- `lens.suggest`, `lens.describe`, `lens.expand`, `lens.required_fields`, and `lens.plan` help agents select and apply semantic overlays.
- `query.run` validates named or temporary queries and executes them with the Malloy SDK unless `dry_run_only` is true; executed queries require a `query_limit_seconds` deadline.
- `action.invoke` generates supported action SQL and executes it through the configured Malloy connection.
- `reasoning.derive` gathers concept, metric, lens, and path hints for an analytical question.

See the tool reference pages for request shapes and response notes:

- [Tools Overview](./tools-overview.md)
- [Source and Search Tools](./source-and-search.md)
- [Ontology Tools](./ontology-tools.md)
- [Lens Tools](./lens-tools.md)
- [Query and Action Tools](./query-and-action-tools.md)
- [Reasoning Tools](./reasoning-tools.md)
- [Malloy Connections](./malloy-connections.md)

## Troubleshooting

If an agent cannot start `semlang mcp`, verify that `npm link` created the global command and that dependencies exist in the SemLang checkout:

```bash
command -v semlang
cd /Users/noah/Documents/semlang2
npm install
npm link
```
