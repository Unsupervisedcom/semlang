---
title: Source and Search Tools
sidebar_position: 3
---

# Source and Search Tools

Use these tools at the start of an agent workflow to load a model, find relevant ontology objects, and resolve business labels.

## `set_ontology_source`

Compiles one or more SemLang files or inline source strings and stores the resulting model in the MCP session.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `path` | string | Path to one SemLang file. |
| `paths` | string array | Paths to multiple SemLang files. The server creates an include-based context file. |
| `filePath` | string | Alias for `path` when loading a file, or a base file path for inline source. |
| `filePaths` | string array | Alias for `paths`. |
| `source` | string | Inline SemLang source. |
| `sources` | string array | Multiple inline sources joined with blank lines. |
| `basePath` | string | File path used for resolving includes when compiling inline source. |
| `projectPath` | string | Malloy project root to associate with the MCP context. |
| `configPath` | string | Explicit Malloy config file to associate with the MCP context. |

### Output

Returns `ok`, `diagnostics`, and a `context` summary with package name, loaded files, counts, source names, type names, concept names, lens names, query names, and Malloy project/config context when available.

### Example

```json
{
  "path": "examples/retail-omnichannel-margin-and-returns/example.semlang"
}
```

## `semantic.search_terms`

Searches concepts, metrics, members, queries, and lenses using terms from a user question or phrase. Role search includes qualified role names, labels, aliases, and predicates.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `question` | string | Preferred natural-language search text. |
| `query` | string | Alias for `question`. |
| `phrase` | string | Alias for `question`. |
| `text` | string | Alias for `question`. |
| `limit` | number | Maximum results per category. Defaults to 20. |

### Output

Returns `concepts`, `metrics`, `members`, `queries`, and `lenses`. Each match includes a score and matched terms.

### Example

```json
{
  "question": "monthly margin and returns by region and product category",
  "limit": 8
}
```

## `catalog.resolve_entity`

Resolves a name or business label to ontology objects. When a concept and business label are supplied and local DuckDB example data is available, the tool also searches likely identifier, name, label, code, region, city, state, status, type, and market fields for matching rows.

### Inputs

| Field | Type | Notes |
| --- | --- | --- |
| `entity` | string | Ontology name or term to resolve. |
| `name` | string | Alias for `entity`. |
| `term` | string | Alias for `entity`. |
| `concept` | string | Optional concept to search for a business label. |
| `business_name` | string | Business label to resolve against candidate fields and local example data. |
| `businessName` | string | Alias for `business_name`. |

### Output

Name resolution returns matching sources, types, concepts, members, lenses, and queries. Business-label resolution returns candidate identifiers, candidate fields, matching rows when available, roles, and a note explaining whether local DuckDB data was used.

### Example

```json
{
  "concept": "Store",
  "business_name": "Denver"
}
```
