import {
  jsonSchemaMetadataKeywords,
  semlangTypeMetadataKeywords,
  parseMetadataLiteral,
  parseMetadataValue,
} from "./schema-metadata.js";
import { qualifiedRoleName } from "./roles.js";
import type {
  DefinitionDecl,
  Diagnostic,
  FieldDecl,
  IdentityField,
  JsonSchemaDocument,
  JsonSchemaEmitOptions,
  JsonSchemaEmitResult,
  ResolvedConcept,
  SemanticModel,
  TypeDecl,
} from "./types.js";

const draft2020Schema = "https://json-schema.org/draft/2020-12/schema";
export const semlangVocabularyUri = "https://semlang.dev/vocab/semlang/1";

// 01.02.001: the public exporter emits a draft 2020-12 JSON Schema
// document plus the SemLang vocabulary for semantic extensions.
export function emitJsonSchema(model: SemanticModel, options: JsonSchemaEmitOptions = {}): JsonSchemaEmitResult {
  const diagnostics: Diagnostic[] = [];
  const defs: Record<string, unknown> = {};

  for (const type of model.types.values()) {
    defs[typeDefName(type.name)] = emitTypeSchema(type);
  }

  const conceptNames = options.concepts ? new Set(options.concepts) : undefined;
  if (conceptNames) {
    for (const conceptName of conceptNames) {
      if (!model.concepts.has(conceptName)) {
        diagnostics.push({
          severity: "error",
          code: "UNKNOWN_SCHEMA_CONCEPT",
          message: `Cannot emit JSON Schema for unknown concept ${conceptName}.`,
        });
      }
    }
  }

  for (const concept of model.concepts.values()) {
    if (conceptNames && !conceptNames.has(concept.name)) continue;
    defs[conceptDefName(concept.name)] = emitConceptSchema(model, concept);
  }

  const schema: JsonSchemaDocument = {
    $schema: draft2020Schema,
    $id: options.id,
    $vocabulary: {
      [semlangVocabularyUri]: true,
    },
    title: options.title ?? `${model.packageName} schema`,
    type: "object",
    $defs: defs,
    "x-semlang-package": model.packageName,
    "x-semlang-files": model.files,
    "x-semlang-ignored-sources": model.ignored.map((ignored) => ({
      source: ignored.source.expression,
      sourceKind: ignored.source.kind,
      reason: ignored.reason ? stripQuoted(ignored.reason) : undefined,
      metadata: Object.fromEntries(ignored.metadata.map((entry) => [entry.key, parseMetadataValue(entry)])),
    })),
  };
  if (!options.id) delete schema.$id;
  if (model.ignored.length === 0) delete schema["x-semlang-ignored-sources"];
  return { schema, diagnostics };
}

function emitTypeSchema(type: TypeDecl): Record<string, unknown> {
  const schema = baseTypeSchema(type.base);
  schema.title = type.name;

  for (const entry of type.metadata) {
    const value = parseMetadataValue(entry);
    if (jsonSchemaMetadataKeywords.has(entry.key)) {
      schema[entry.key] = value;
    } else if (semlangTypeMetadataKeywords.has(entry.key)) {
      schema[`x-semlang-${camelToKebab(entry.key)}`] = value;
    } else {
      schema[`x-semlang-metadata-${camelToKebab(entry.key)}`] = value;
    }
  }

  if (type.base === "date" && !("format" in schema)) schema.format = "date";
  if (type.base === "timestamp" && !("format" in schema)) schema.format = "date-time";
  if (type.base === "currency") schema["x-semlang-primitive"] = "currency";
  return schema;
}

function emitConceptSchema(model: SemanticModel, concept: ResolvedConcept): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const identity of concept.identities) {
    properties[identity.name] = emitFieldSchema(model, identity, { identity: true });
    required.push(identity.name);
  }
  for (const field of concept.fields) {
    properties[field.name] = emitFieldSchema(model, field, { unique: field.unique });
    required.push(field.name);
  }

  const schema: Record<string, unknown> = {
    title: concept.name,
    type: "object",
    additionalProperties: true,
    properties,
    required,
    "x-semlang-concept": concept.name,
    "x-semlang-stereotype": concept.stereotype,
    "x-semlang-source": concept.source.expression,
    "x-semlang-identity": concept.identities.map((identity) => identity.name),
  };

  if (concept.description) schema.description = stripQuoted(concept.description);
  if (concept.phaseParent) schema["x-semlang-phase-parent"] = concept.phaseParent;
  if (concept.joins.length > 0)
    schema["x-semlang-joins"] = concept.joins.map((join) => ({
      kind: join.kind,
      name: join.name,
      optional: join.optional,
      target: join.target,
      on: join.on,
      with: join.with,
      at: join.at,
    }));
  if (concept.roles.length > 0)
    schema["x-semlang-roles"] = concept.roles.map((role) => ({
      name: role.name,
      qualifiedName: qualifiedRoleName(concept.name, role.name),
      label: role.label ?? undefined,
      aliases: role.aliases,
      predicate: role.predicate,
    }));
  if (concept.temporal.length > 0)
    schema["x-semlang-temporal"] = concept.temporal.map((axis) => ({
      axis: axis.axis,
      expression: axis.expression,
    }));
  if (concept.where.length > 0) schema["x-semlang-where"] = concept.where.map((where) => where.expression);
  if (concept.validations.length > 0)
    schema["x-semlang-validations"] = concept.validations.map((validation) => ({
      name: validation.name,
      description: validation.description ? stripQuoted(validation.description) : undefined,
      predicate: validation.predicate,
    }));
  if (concept.dimensions.length > 0)
    schema["x-semlang-dimensions"] = concept.dimensions.map((definition) => emitDefinition(model, definition));
  if (concept.measures.length > 0)
    schema["x-semlang-measures"] = concept.measures.map((definition) => emitDefinition(model, definition));

  return schema;
}

function emitFieldSchema(
  model: SemanticModel,
  field: FieldDecl | IdentityField,
  options: { identity?: boolean; unique?: boolean } = {},
): Record<string, unknown> {
  const schema = typeReferenceOrPrimitive(model, field.typeName);
  if (field.nullable) {
    return {
      anyOf: [schema, { type: "null" }],
      ...(options.identity ? { "x-semlang-identity": true } : {}),
      ...(options.unique ? { "x-semlang-unique": true } : {}),
    };
  }
  if (options.identity) schema["x-semlang-identity"] = true;
  if (options.unique) schema["x-semlang-unique"] = true;
  return schema;
}

function emitDefinition(model: SemanticModel, definition: DefinitionDecl): Record<string, unknown> {
  return {
    name: definition.name,
    expression: definition.expression,
    type: definition.typeName
      ? nullableSchema(typeReferenceOrPrimitive(model, definition.typeName), Boolean(definition.nullable))
      : undefined,
  };
}

function nullableSchema(schema: Record<string, unknown>, nullable: boolean): Record<string, unknown> {
  return nullable ? { anyOf: [schema, { type: "null" }] } : schema;
}

function typeReferenceOrPrimitive(model: SemanticModel, typeName: string): Record<string, unknown> {
  return model.types.has(typeName) ? { $ref: `#/$defs/${typeDefName(typeName)}` } : baseTypeSchema(typeName);
}

function baseTypeSchema(typeName: string): Record<string, unknown> {
  if (typeName === "number" || typeName === "currency") return { type: "number" };
  if (typeName === "date") return { type: "string", format: "date" };
  if (typeName === "timestamp") return { type: "string", format: "date-time" };
  if (typeName === "boolean") return { type: "boolean" };
  return { type: "string" };
}

function typeDefName(name: string): string {
  return `type.${name}`;
}

function conceptDefName(name: string): string {
  return `concept.${name}`;
}

function camelToKebab(text: string): string {
  return text
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function stripQuoted(text: string): string {
  const value = parseMetadataLiteral(text);
  return typeof value === "string" ? value : text;
}
