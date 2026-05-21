---
title: Tools Overview
sidebar_position: 2
---

# Tools Overview

The SemLang MCP server exposes ontology-aware tools for agents that need to discover a model, inspect semantic structure, plan lens overlays, validate queries, run Malloy-backed queries, and invoke supported local actions.

Call `set_ontology_source` first in each MCP session. All other tools read the compiled model held in the server context and return an error if no source has been loaded.

## Tool Groups

| Group               | Tools                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source and search   | `set_ontology_source`, `semantic.search_terms`, `catalog.resolve_entity`                                                                                                                          |
| Ontology inspection | `ontology.describe_concept`, `ontology.describe_action`, `ontology.describe_role`, `ontology.describe_roles`, `ontology.explain_metric`, `ontology.describe_temporal_axes`, `ontology.find_paths` |
| Lenses              | `lens.suggest`, `lens.describe`, `lens.expand`, `lens.required_fields`, `lens.plan`                                                                                                               |
| Queries and actions | `query.validate`, `query.run`, `action.invoke`                                                                                                                                                    |
| Reasoning           | `reasoning.derive`                                                                                                                                                                                |

## Response Shape

Tools return structured JSON. Successful responses generally include `ok: true`; failed or skipped operations return `ok: false` with an `error`, `reason`, `diagnostics`, or `candidates` field.

`set_ontology_source` captures Malloy project/config context. It uses an explicit `configPath` / `malloyConfigPath` when supplied; otherwise it discovers `malloy-config-local.json` or `malloy-config.json` by walking upward from the SemLang file. If no config is found, the tool fails with a clear setup error. `query.run` executes through the Malloy SDK using that captured config and requires `query_limit_seconds`. `action.invoke` is separate and remains a local DuckDB action adapter for supported action edits.
