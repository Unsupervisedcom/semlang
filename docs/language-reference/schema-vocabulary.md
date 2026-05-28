---
title: Schema Vocabulary
sidebar_position: 7
---

SemLang can project its semantic type system to JSON Schema draft 2020-12. The exported schema uses native JSON Schema keywords for value validation and the SemLang vocabulary URI for semantic metadata:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$vocabulary": {
    "https://semlang.dev/vocab/semlang/1": true
  }
}
```

## Type Metadata

Semantic type declarations may use JSON Schema-style metadata:

```semlang
type: ReturnStatus is string {
  description: "Lifecycle state for a return line."
  enum: ['authorized', 'received', 'accepted', 'rejected', 'settled']
}

type: EmailAddress is string {
  format: email
  maxLength: 320
}
```

Recognized JSON Schema metadata includes `title`, `description`, `default`, `deprecated`, `readOnly`, `writeOnly`, `examples`, `enum`, `const`, numeric bounds, string bounds, `pattern`, `format`, content annotations, array bounds, object bounds, `properties`, `items`, and related applicator keywords. SemLang validates the simple scalar and array shapes it can check locally.

SemLang-specific type metadata remains available for semantic meaning:

- `scale_type`
- `identifies`
- `identifies_role`
- `currency`
- `unit`
- `render_format`

These project to `x-semlang-*` keywords.

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
        "store_id": {
          "$ref": "#/$defs/type.StoreId",
          "description": "Stable store key.",
          "x-semlang-identity": true
        },
        "closed_date": {
          "description": "Date the store stopped accepting orders.",
          "anyOf": [{ "$ref": "#/$defs/type.BusinessDate" }, { "type": "null" }]
        }
      },
      "x-semlang-measures": [
        {
          "name": "store_count",
          "description": "Count of store rows.",
          "expression": "count()"
        }
      ],
      "x-semlang-stereotype": "kind"
    }
  }
}
```

Identity and field descriptions export as property-level `description` values. Joins, roles, temporal axes, validations, dimensions, and measures are semantic model features rather than plain JSON value constraints, so they export as `x-semlang-*` metadata; dimension and measure descriptions are preserved inside those metadata objects. Role metadata includes the local name, qualified name, predicate, optional label, and aliases.

## CLI

Use the compiler CLI to emit the JSON Schema artifact:

```bash
semlang compile model.semlang --emit json-schema
```
