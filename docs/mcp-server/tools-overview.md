---
title: Tools Overview
sidebar_position: 2
---

# Tools Overview

The SemLang MCP server exposes a compact ontology-aware tool surface for agents that need to discover a model, inspect semantic structure, plan lens overlays, validate queries, run Malloy-backed queries, and invoke supported local actions.

Call `load_ontology` first in each MCP session.
All other tools read the compiled model held in the server context and return an error if no source has been loaded.

## Public Tools

| Tool            | Use it for                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `load_ontology` | Compile the configured SemLang ontology or inline source into MCP session context and capture Malloy config settings when available.                               |
| `search`        | Find relevant ontology objects, resolve names or business labels, and suggest lenses.                                                                              |
| `describe`      | Inspect concepts, actions, roles, metrics, temporal axes, and lenses; expand lens overlays; report required lens fields; and produce lens application plan detail. |
| `find_paths`    | Explore declared join paths between concepts or role targets.                                                                                                      |
| `run_query`     | Validate named or temporary queries and execute them through the Malloy SDK unless `dry_run_only` is true.                                                         |
| `invoke_action` | Generate and execute supported local action SQL through the configured Malloy connection, or return generated SQL with `dry_run_only`.                             |

The public manifest intentionally avoids duplicate aliases and narrowly sliced helper tools.
Consolidated tools use structured input schemas with explicit modes so agents can choose valid arguments without carrying a long list of overlapping tool names in context.

## Response Shape

Tools return structured JSON.
Successful responses generally include `ok: true`; failed or skipped operations return `ok: false` with an `error`, `reason`, `diagnostics`, or `candidates` field.

`load_ontology({})` reads `.semlang/settings.yml` for the ontology entrypoint and runtime paths.
If config is missing, it returns setup guidance.
`run_query` executes through the Malloy SDK using the captured Malloy config and requires `query_limit_seconds` unless `dry_run_only` is true.
`invoke_action` uses the same captured Malloy connection context to execute generated action SQL.
