/*
 * Purpose: Provides lightweight expression-token helpers shared by MCP search, action SQL, and query execution.
 * Encapsulation: Keep syntax-agnostic token extraction here; semantic path resolution belongs with each caller.
 */

export function expressionIdentifiers(expression: string): string[] {
  const stripped = expression.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, " ");
  const keywords = new Set([
    "and",
    "or",
    "not",
    "is",
    "null",
    "in",
    "case",
    "when",
    "then",
    "else",
    "end",
    "distinct",
    "true",
    "false",
    "this",
  ]);
  return [
    ...new Set(
      (stripped.match(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g) ?? []).filter(
        (item) => !keywords.has(item.toLowerCase()) && !/^[A-Z]/.test(item),
      ),
    ),
  ];
}
