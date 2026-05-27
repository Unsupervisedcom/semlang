/*
 * Purpose: Defines the ordered public MCP tool manifest metadata exposed to agents.
 * Encapsulation: Keep Zod schemas, tool descriptions, and manifest order here; command wiring belongs in src/semlang-runtime.ts.
 */

import * as z from "zod/v4";

const stringArrayInputSchema = z.array(z.string());
const stringOrStringArrayInputSchema = z.union([z.string(), stringArrayInputSchema]);

export const mcpToolOrder = [
  "load_ontology",
  "search",
  "describe",
  "find_paths",
  "run_query",
  "invoke_action",
] as const;

export type McpToolName = (typeof mcpToolOrder)[number];

export const mcpToolDescriptions = {
  load_ontology: "Load a SemLang ontology.",
  search: "Search ontology objects.",
  describe: "Describe ontology objects.",
  find_paths: "Find join paths.",
  run_query: "Validate or run a query.",
  invoke_action: "Invoke an action.",
} satisfies Record<McpToolName, string>;

export const mcpToolInputSchemas = {
  load_ontology: z
    .object({
      path: z.string().optional(),
      source: z.string().optional(),
      configPath: z.string().optional(),
      malloyConfigPath: z.string().optional(),
      returnMalloyModel: z.boolean().optional(),
    })
    .passthrough(),
  search: z
    .object({
      query: z.string().optional(),
      kind: z.enum(["any", "concept", "member", "metric", "lens", "query", "entity"]).optional(),
      limit: z.number().optional(),
    })
    .passthrough(),
  describe: z
    .object({
      kind: z.enum(["concept", "action", "role", "roles", "metric", "temporal_axes", "lens"]).optional(),
      operation: z.enum(["detail", "expand", "required_fields", "plan"]).optional(),
      names: stringArrayInputSchema.optional(),
      question: z.string().optional(),
      fields: stringOrStringArrayInputSchema.optional(),
      include_stats: z.boolean().optional(),
    })
    .passthrough(),
  find_paths: z
    .object({
      from: z.string().optional(),
      to: stringOrStringArrayInputSchema.optional(),
      maxDepth: z.number().optional(),
    })
    .passthrough(),
  run_query: z
    .object({
      query: z.string().optional(),
      root: z.string().optional(),
      body: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
      lenses: stringArrayInputSchema.optional(),
      dry_run_only: z.boolean().optional(),
      query_limit_seconds: z.number().optional(),
      rowLimit: z.number().optional(),
    })
    .passthrough(),
  invoke_action: z
    .object({
      action: z.string().optional(),
      concept: z.string().optional(),
      params: z.record(z.string(), z.unknown()).optional(),
      target: z.record(z.string(), z.unknown()).optional(),
      dry_run_only: z.boolean().optional(),
      query_limit_seconds: z.number().optional(),
    })
    .passthrough(),
} satisfies Record<McpToolName, z.ZodType>;
