---
title: MCP Server
sidebar_position: 1
---

# MCP Server

The SemLang MCP server gives agents tools for semantic discovery, ontology navigation, lens planning, query validation, local query execution, and supported action invocation.

## Live Source Install

Install the current checkout globally with npm link:

```bash
cd /Users/noah/Documents/semlang2
npm install
npm link
```

This exposes `semlang-mcp` anywhere on the machine. The command is intentionally source-backed: every MCP process starts through the checked-out TypeScript source with the repo-local `tsx`, so new agents pick up code changes without waiting for a build. Restart an already-running MCP session to load edits made after it started.

## Project Configuration

Add a project-local MCP config that points at the global command:

```json
{
  "mcpServers": {
    "semlang": {
      "command": "semlang-mcp",
      "args": []
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

## Tool Surface

Common tools include:

- `set_ontology_source` compiles one or more SemLang files into the MCP context.
- `semantic.search_terms` finds relevant concepts, fields, metrics, queries, lenses, and actions.
- `catalog.resolve_entity` resolves ontology names and, when local DuckDB example data is available, business labels.
- `ontology.describe_concept` explains a concept and its semantic members.
- `ontology.describe_action`, `ontology.describe_role`, `ontology.describe_roles`, `ontology.explain_metric`, and `ontology.describe_temporal_axes` expose focused ontology details.
- `ontology.find_paths` finds join paths between concepts.
- `lens.suggest`, `lens.describe`, `lens.expand`, `lens.required_fields`, and `lens.plan` help agents select and apply semantic overlays.
- `query.validate` checks named or temporary queries.
- `query.run` emits Malloy and executes against nearby local DuckDB example data when available.
- `action.invoke` runs supported local DuckDB action edits when the model declares actions.
- `reasoning.derive` gathers concept, metric, lens, and path hints for an analytical question.

See the tool reference pages for request shapes and response notes:

- [Tools Overview](./tools-overview.md)
- [Source and Search Tools](./source-and-search.md)
- [Ontology Tools](./ontology-tools.md)
- [Lens Tools](./lens-tools.md)
- [Query and Action Tools](./query-and-action-tools.md)
- [Reasoning Tools](./reasoning-tools.md)

## Troubleshooting

If an agent cannot start `semlang-mcp`, verify that `npm link` created the global command and that dependencies exist in the SemLang checkout:

```bash
command -v semlang-mcp
cd /Users/noah/Documents/semlang2
npm install
npm link
```
