---
title: MCP Server
sidebar_position: 1
---

# MCP Server

The SemLang MCP server gives agents a small set of tools for semantic discovery, ontology navigation, lens planning, query validation, Malloy-backed query execution, and supported local action invocation.

SemLang models use Malloy-style named connections in source declarations.
Configure those connections in Malloy project or global config using the same names referenced by `.semlang` files; see [Malloy Connections](./malloy-connections.md) for setup details.

## Live Source Install

Install the current checkout globally with npm link:

```bash
cd /Users/noah/Documents/semlang2
npm install
npm link
```

This exposes `semlang` anywhere on the machine.
The MCP command is intentionally source-backed: every MCP process starts through the checked-out TypeScript source with the repo-local `tsx`, so new agents pick up code changes without waiting for a build.
Restart an already-running MCP session to load edits made after it started.

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

Agents should load the relevant model with `load_ontology` before using ontology or query tools:

```json
{}
```

Create the project config first:

```bash
semlang setup
```

`semlang setup --preview` prints the generated `.semlang/settings.yml` without writing it, and `--path <file>` chooses the ontology entrypoint when discovery is ambiguous.

MCP client configuration can usually stay this small:

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

`run_query` returns a transaction GUID for tracing.
If executed row output is larger than 10 lines, SemLang writes the rows to `<export-directory>/<transaction-guid>.json` and returns that path instead of inline rows.

## Tool Surface

Public tools include:

- `load_ontology` compiles the configured SemLang ontology, or an explicit source/path escape hatch, into the MCP context.
- `search` finds relevant ontology objects, resolves ontology names and business labels, and suggests lenses.
- `describe` explains concepts, actions, roles, metrics, temporal axes, and lenses, including lens expansion, required fields, and lens plans.
- `find_paths` finds join paths between concepts or role targets.
- `run_query` validates named or temporary queries and executes them with the Malloy SDK unless `dry_run_only` is true; executed queries require a `query_limit_seconds` deadline.
- `invoke_action` generates supported action SQL and executes it through the configured Malloy connection.

The manifest is intentionally non-duplicative: older narrow helper names are folded into the six public tools so agents see fewer overlapping choices with more meaningful schemas.

See the tool reference pages for request shapes and response notes:

- [Configuration](./configuration.md)
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
