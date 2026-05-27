/*
 * Purpose: Provides MCP-safe JSON typing and small coercion helpers for tool argument handling.
 * Encapsulation: Keep generic serialization, primitive argument parsing, and diagnostic predicates here; command orchestration and domain-specific SemLang logic belong in src/semlang-runtime.ts.
 */

import path from "node:path";
import type { Diagnostic } from "./types.js";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function prettyJsonLineCount(value: unknown): number {
  if (value === null || typeof value !== "object") return 1;
  if (Array.isArray(value)) {
    if (value.length === 0) return 1;
    return 2 + value.length + value.reduce((count, item) => count + prettyJsonLineCount(item) - 1, 0);
  }
  const jsonObject = value as Record<string, unknown>;
  const jsonKeys = Object.keys(jsonObject).filter((key) => {
    const item = jsonObject[key];
    return item !== undefined && typeof item !== "function" && typeof item !== "symbol";
  });
  if (jsonKeys.length === 0) return 1;
  return 2 + jsonKeys.length + jsonKeys.reduce((count, key) => count + prettyJsonLineCount(jsonObject[key]) - 1, 0);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function resolveOptionalPath(value: string | undefined): string | undefined {
  return value ? path.resolve(value) : undefined;
}

export function pathWithinOrEqual(child: string, ancestor: string): boolean {
  const relative = path.relative(path.resolve(ancestor), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function stringList(value: unknown): string[] {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
      .map((item) => item.trim());
  return [];
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function resolved(value: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  return Promise.resolve(jsonSafe(value) as Record<string, JsonValue>);
}

export function jsonSafe(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (value === undefined) return null;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Map)
    return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), jsonSafe(item)]));
  if (value instanceof Set) return [...value].map(jsonSafe);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonSafe(item)]),
    );
  }
  return String(value);
}
