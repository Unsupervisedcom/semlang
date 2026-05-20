import type { Diagnostic, MetadataEntry } from "./types.js";

// 01.01.007: JSON-Schema-compatible type metadata is parsed centrally so
// validation and export agree on keyword value shapes.
export const jsonSchemaMetadataKeywords = new Set([
  "title",
  "description",
  "default",
  "deprecated",
  "readOnly",
  "writeOnly",
  "examples",
  "enum",
  "const",
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "format",
  "contentEncoding",
  "contentMediaType",
  "contentSchema",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxContains",
  "minContains",
  "maxProperties",
  "minProperties",
  "required",
  "dependentRequired",
  "additionalProperties",
  "properties",
  "patternProperties",
  "propertyNames",
  "items",
  "prefixItems",
  "contains"
]);

export const semlangTypeMetadataKeywords = new Set([
  "scale_type",
  "identifies",
  "identifies_role",
  "currency",
  "unit",
  "render_format"
]);

export const legacyTypeMetadataReplacements = new Map([
  ["allowed_values", "enum"],
  ["semantics", "description"],
  ["format", "render_format when the value is a Malloy renderer expression; use JSON Schema format strings otherwise"]
]);

export function parseMetadataLiteral(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  const quoted = parseQuoted(trimmed);
  if (quoted !== undefined) return quoted;
  const jsonish = trimmed.replace(/'((?:[^'\\]|\\.)*)'/g, (_match, body: string) => JSON.stringify(unescapeSingleQuoted(body)));
  try {
    return JSON.parse(jsonish);
  } catch {
    return trimmed;
  }
}

export function validateTypeMetadataEntry(entry: MetadataEntry): Diagnostic | undefined {
  const replacement = legacyTypeMetadataReplacements.get(entry.key);
  if (entry.key === "format" && isJsonSchemaFormatValue(entry.value)) return undefined;
  if (replacement) {
    return {
      severity: "error",
      code: "LEGACY_TYPE_METADATA",
      message: `Type metadata ${entry.key} is not supported; use ${replacement}.`,
      location: entry.location
    };
  }
  if (entry.key === "enum") {
    const value = parseMetadataLiteral(entry.value);
    if (!Array.isArray(value)) {
      return {
        severity: "error",
        code: "INVALID_TYPE_METADATA",
        message: "Type metadata enum must be an array literal.",
        location: entry.location
      };
    }
  }
  if (numericMetadataKeywords.has(entry.key) && typeof parseMetadataLiteral(entry.value) !== "number") {
    return {
      severity: "error",
      code: "INVALID_TYPE_METADATA",
      message: `Type metadata ${entry.key} must be numeric.`,
      location: entry.location
    };
  }
  if (integerMetadataKeywords.has(entry.key)) {
    const value = parseMetadataLiteral(entry.value);
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return {
        severity: "error",
        code: "INVALID_TYPE_METADATA",
        message: `Type metadata ${entry.key} must be an integer.`,
        location: entry.location
      };
    }
  }
  if (booleanMetadataKeywords.has(entry.key) && typeof parseMetadataLiteral(entry.value) !== "boolean") {
    return {
      severity: "error",
      code: "INVALID_TYPE_METADATA",
      message: `Type metadata ${entry.key} must be true or false.`,
      location: entry.location
    };
  }
  if (arrayMetadataKeywords.has(entry.key) && !Array.isArray(parseMetadataLiteral(entry.value))) {
    return {
      severity: "error",
      code: "INVALID_TYPE_METADATA",
      message: `Type metadata ${entry.key} must be an array literal.`,
      location: entry.location
    };
  }
  return undefined;
}

function isJsonSchemaFormatValue(value: string): boolean {
  const parsed = parseMetadataLiteral(value);
  return typeof parsed === "string" && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(parsed);
}

function parseQuoted(text: string): string | undefined {
  const quote = text[0];
  if ((quote !== "'" && quote !== "\"") || text[text.length - 1] !== quote) return undefined;
  if (quote === "'") return unescapeSingleQuoted(text.slice(1, -1));
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function unescapeSingleQuoted(text: string): string {
  return text.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
}

const numericMetadataKeywords = new Set(["multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum"]);
const integerMetadataKeywords = new Set(["maxLength", "minLength", "maxItems", "minItems", "maxContains", "minContains", "maxProperties", "minProperties"]);
const booleanMetadataKeywords = new Set(["deprecated", "readOnly", "writeOnly", "uniqueItems"]);
const arrayMetadataKeywords = new Set(["examples", "required", "prefixItems"]);
