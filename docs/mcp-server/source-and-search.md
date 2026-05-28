---
title: Source and Search Tools
sidebar_position: 3
---

# Source and Search Tools

Use these tools at the start of an agent workflow to load a model, find relevant ontology objects, and resolve business labels.

## `load_ontology`

Compiles one or more SemLang files or inline source strings and stores the resulting model in the MCP session.

### Inputs

| Field               | Type    | Notes                                                                                                      |
| ------------------- | ------- | ---------------------------------------------------------------------------------------------------------- |
| `path`              | string  | Explicit SemLang file path escape hatch. Normal projects should use `.semlang/settings.yml` and omit this. |
| `source`            | string  | Inline SemLang source.                                                                                     |
| `malloyConfigPath`  | string  | Explicit Malloy config file escape hatch. Normal projects should use `.semlang/settings.yml`.              |
| `returnMalloyModel` | boolean | When true, include the full compiled Malloy model in `malloyModel`. Defaults to false.                     |

With no inputs, `load_ontology` uses the entrypoint and runtime paths from `.semlang/settings.yml`.
If no config is available, it returns setup guidance instead of guessing paths.

### Output

Returns `ok`, `diagnostics`, and a `context` summary with package name, loaded files, counts, source names, type names, concept names, lens names, query names, and Malloy project/config context when available.
The full compiled Malloy model is omitted by default and returned as `malloyModel` only when requested with `returnMalloyModel`.

### Example

```json
{}
```

## `search`

Searches concepts, metrics, members, queries, and lenses using terms from a user question or phrase.
It can also resolve ontology names or business labels when `kind` is `entity`.

### Inputs

| Field   | Type   | Notes                                                                                     |
| ------- | ------ | ----------------------------------------------------------------------------------------- |
| `query` | string | Search text, ontology name, or business label.                                            |
| `kind`  | string | Optional result kind: `any`, `concept`, `member`, `metric`, `lens`, `query`, or `entity`. |
| `limit` | number | Maximum results per category. Defaults to 20.                                             |

### Output

Metadata search returns matching concepts, metrics, members, queries, lenses, actions, and roles.
Each match includes a score and matched terms.
Entity resolution returns matching sources, types, concepts, members, lenses, queries, candidate identifiers, candidate fields, matching rows when local DuckDB example data is available, and roles.

Lens-oriented responses include scored lenses with descriptions, parents, refined concepts, scores, and matched terms.
Use `find_paths` when the exact join route matters.

### Example

```json
{
  "query": "monthly margin and returns by region and product category",
  "limit": 8
}
```

### Example

```json
{
  "kind": "entity",
  "query": "Store Denver"
}
```
