---
title: Schema Vocabulary
sidebar_position: 7
---

OntoQL can project its semantic type system to JSON Schema draft 2020-12. The exported schema uses native JSON Schema keywords for value validation and the OntoQL vocabulary URI for semantic metadata:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$vocabulary": {
    "https://semlang.dev/vocab/ontoql/1": true
  }
}
```

## Type Metadata

Semantic type declarations may use JSON Schema-style metadata:

```ontoql
type: ReturnStatus is string {
  description: "Lifecycle state for a return line."
  enum: ['authorized', 'received', 'accepted', 'rejected', 'settled']
}

type: EmailAddress is string {
  format: email
  maxLength: 320
}
```

Recognized JSON Schema metadata includes `title`, `description`, `default`, `deprecated`, `readOnly`, `writeOnly`, `examples`, `enum`, `const`, numeric bounds, string bounds, `pattern`, `format`, content annotations, array bounds, object bounds, `properties`, `items`, and related applicator keywords. OntoQL validates the simple scalar and array shapes it can check locally.

OntoQL-specific type metadata remains available for semantic meaning:

- `scale_type`
- `identifies`
- `identifies_role`
- `currency`
- `unit`
- `render_format`

These project to `x-ontoql-*` keywords.

## Export Shape

Semantic types export under `$defs` names beginning with `type.`:

```json
{
  "$defs": {
    "type.ReturnStatus": {
      "type": "string",
      "enum": ["authorized", "received", "accepted", "rejected", "settled"]
    }
  }
}
```

Concept row schemas export under `$defs` names beginning with `concept.`:

```json
{
  "$defs": {
    "concept.Store": {
      "type": "object",
      "required": ["store_id", "closed_date"],
      "properties": {
        "store_id": { "$ref": "#/$defs/type.StoreId", "x-ontoql-identity": true },
        "closed_date": {
          "anyOf": [
            { "$ref": "#/$defs/type.BusinessDate" },
            { "type": "null" }
          ]
        }
      },
      "x-ontoql-stereotype": "kind"
    }
  }
}
```

Joins, roles, temporal axes, validations, dimensions, and measures are semantic model features rather than plain JSON value constraints, so they export as `x-ontoql-*` metadata.

## CLI

Use the compiler CLI to emit the JSON Schema artifact:

```bash
ontoql compile model.ontoql --emit json-schema
```
