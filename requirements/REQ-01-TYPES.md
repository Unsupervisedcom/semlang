# REQ-01-TYPES: Type System and JSON Schema Projection

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern OntoQL/Semlang type declarations, typed fields, compiler diagnostics for type metadata, and JSON Schema export.

## 01.01 Type Declarations and Metadata

Semantic types name value domains over primitive source values. The compiler validates the type base, validates recognized metadata shapes, and keeps type annotations available to later compiler stages.

- 01.01.001: The compiler MUST accept the primitive type bases `string`, `number`, `date`, `timestamp`, `currency`, and `boolean`.
- 01.01.002: The compiler MUST reject type declarations whose base is not a supported primitive type.
- 01.01.003: The compiler MUST resolve typed identities, fields, dimensions, and measures against either supported primitive bases or declared semantic types.
- 01.01.004: A trailing `?` on a typed identity, field, dimension, or measure MUST mark the value as nullable.
- 01.01.005: The compiler MUST reject legacy `allowed_values` type metadata; authors MUST use `enum`.
- 01.01.006: The compiler MUST reject legacy type-level `semantics` metadata; authors MUST use JSON Schema-style `description`.
- 01.01.007: The compiler MUST parse and validate recognized JSON Schema-style type metadata before emitting a model or JSON Schema artifact.

## 01.02 JSON Schema Exporting

The JSON Schema exporter projects semantic types and concept row shapes into a portable validation artifact. Ontology features that do not have exact JSON Schema semantics are preserved as vocabulary extension metadata.

- 01.02.001: The JSON Schema exporter MUST emit a draft 2020-12 document and declare the OntoQL/Semlang vocabulary URI `https://semlang.dev/vocab/ontoql/1`.
- 01.02.002: Semantic type declarations MUST export into `$defs` entries named `type.<TypeName>`.
- 01.02.003: Concept row schemas MUST export into `$defs` entries named `concept.<ConceptName>`.
- 01.02.004: Semantic type references in concept properties MUST export as `$ref` values pointing at their `type.<TypeName>` definitions.
- 01.02.005: Primitive fields MUST export to their closest JSON Schema primitive shape: `string`, `number`, `boolean`, `date` as string `format: date`, and `timestamp` as string `format: date-time`.
- 01.02.006: `currency` values MUST export as JSON Schema numbers with `x-ontoql-primitive: currency`.
- 01.02.007: Nullable properties MUST include `null` in their JSON Schema value shape.
- 01.02.008: Concept identities and fields SHOULD appear in the exported concept row schema `required` list because that schema describes source-backed concept rows, not query results, projected views, or sparse patch objects.
- 01.02.009: Field `unique` metadata MUST export as `x-ontoql-unique: true`.
- 01.02.010: Identity fields MUST export with `x-ontoql-identity: true`, and concept schemas MUST list identity field names in `x-ontoql-identity`.
- 01.02.011: Ontological metadata that has no standard JSON Schema keyword MUST export under `x-ontoql-*` extension keywords.
- 01.02.012: Joins, roles, temporal axes, concept filters, validations, dimensions, and measures MUST NOT be represented as native JSON Schema validation keywords unless the compiler can preserve their semantics exactly; they MUST export as `x-ontoql-*` metadata.
- 01.02.013: The CLI MUST allow callers to emit the JSON Schema artifact.

## 01.03 Requirement Traceability

Requirements are intended to be stable anchors for implementation and test intent. Tests must reference the relevant requirement IDs so coverage remains auditable as the language evolves.

- 01.03.001: Every durable requirement ID MUST be referenced by at least one test comment in the test suite.
- 01.03.002: When requirements are added, removed, or changed, tests MUST be updated in the same change so requirement comments remain current.
