/*
 * Purpose: Guards the MCP tools/list manifest size so agent context use stays intentional.
 * Encapsulation: Keep manifest-budget checks here; individual tool behavior belongs in focused MCP tests.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createSemLangMcpServer } from "../../src/index.js";
import { mcpToolDescriptions, mcpToolInputSchemas, mcpToolOrder } from "../../src/mcp-tool-manifest.js";
import { toolsFromCommands, type SemLangCommandRegistry } from "../../src/semlang-runtime.js";

const manifestFixturePath = path.join(import.meta.dirname, "tool-list-manifest.json");
const root = path.resolve(import.meta.dirname, "../..");
const toolManifestTokenBudget = 1412;

describe("SemLang MCP tool manifest", () => {
  it("keeps the loaded tool list within the current context budget", async () => {
    // 02.05.025, 02.05.026, 02.05.027, 02.05.028, 02.05.029,
    // 02.05.030, 02.05.031, 02.05.032, 02.05.033, and 02.05.034:
    // It is a big issue to inflate the context use of the tools list;
    // **make sure you are making your tool list as efficient as possible**.
    // This rough tokenizer intentionally stays dependency-free and stable; update
    // the budget only when the tools/list context cost has been reviewed.
    const server = createSemLangMcpServer();
    const client = new Client({ name: "semlang-manifest-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

      const manifest = await client.listTools();
      const tokenCount = roughTokenCount(JSON.stringify(manifest));
      const toolNames = manifest.tools.map((tool) => tool.name);

      expect(toolNames).not.toEqual(expect.arrayContaining(oldPublicToolNames));
      expect(toolNames).toHaveLength(new Set(toolNames).size);
      expect(duplicateAlternateNames(toolNames)).toEqual([]);
      expect(manifest.tools.every((tool) => tool.execution === undefined)).toBe(true);
      expect(tokenCount, `MCP tools/list rough token count changed to ${tokenCount}.`).toBeLessThanOrEqual(
        toolManifestTokenBudget,
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("matches the reviewed tool list fixture", async () => {
    // 02.05.025, 02.05.028, 02.05.029, 02.05.030, 02.05.031,
    // 02.05.032, 02.05.033, 02.05.034, and 02.05.041: Tool list changes affect every loaded MCP session's context,
    // so any changed tool metadata must update this fixture for reviewer visibility.
    const manifest = await loadCurrentManifest();
    const reviewedManifest = await fs.readFile(manifestFixturePath, "utf8");

    expect(manifest).toEqual(JSON.parse(reviewedManifest));
  });

  it("uses the reviewed manifest module order and metadata", async () => {
    // 02.05.025, 02.05.028, 02.05.030, and 02.05.034: the public manifest
    // is order-sensitive and should stay reviewed in one dedicated module.
    const manifest = await loadCurrentManifest();

    expect(manifest.tools.map((tool) => tool.name)).toEqual([...mcpToolOrder]);
    expect(manifest.tools.map((tool) => tool.description)).toEqual(
      mcpToolOrder.map((name) => mcpToolDescriptions[name]),
    );
    expect(Object.keys(mcpToolInputSchemas)).toEqual([...mcpToolOrder]);
  });

  it("builds public tools from neutral operation command objects", async () => {
    // 00.02.002: SemLang operation wiring should keep command behavior separate
    // from MCP transport names so the same operation objects can back other surfaces.
    const calls: string[] = [];
    const commands = mcpToolOrder.reduce<Partial<SemLangCommandRegistry>>((registry, name) => {
      registry[name] = {
        execute: async (args = {}) => {
          calls.push(name);
          return { ok: true, name, argCount: Object.keys(args).length };
        },
      };
      return registry;
    }, {}) as SemLangCommandRegistry;

    const tools = toolsFromCommands(commands);
    const search = await tools["search"]({ query: "margin" });

    expect(Object.keys(tools)).toEqual([...mcpToolOrder]);
    expect(search).toEqual({ ok: true, name: "search", argCount: 1 });
    expect(calls).toEqual(["search"]);
  });

  it("keeps shared operation runtime behind a neutral module name", async () => {
    // 00.02.003: shared SemLang operation implementation should live behind a
    // neutral module name while legacy MCP module paths remain thin facades.
    const legacyMcpModule = await fs.readFile(path.join(root, "src", "mcp.ts"), "utf8");
    const semlangRuntimeModule = await fs.readFile(path.join(root, "src", "semlang-runtime.ts"), "utf8");

    expect(legacyMcpModule).toContain('export * from "./semlang-runtime.js"');
    expect(semlangRuntimeModule).toContain("toolsFromCommands");
    expect(semlangRuntimeModule).toContain("createSemLangMcpServer");
  });

  it("keeps consolidated tool schemas aligned with the public request shapes", async () => {
    // 02.05.030, 02.05.032, 02.05.033, and 02.05.041: consolidated schemas must expose
    // the argument shapes agents should actually send, without stale detail knobs
    // or old lens-operation names.
    const manifest = await loadCurrentManifest();
    const byName = Object.fromEntries(manifest.tools.map((tool) => [tool.name, tool]));

    expect(JSON.stringify(byName.find_paths?.inputSchema)).toContain('"type":"string"');
    expect(JSON.stringify(byName.load_ontology?.inputSchema)).not.toContain("projectDir");
    expect(JSON.stringify(byName.load_ontology?.inputSchema)).not.toContain('"paths"');
    expect(JSON.stringify(byName.load_ontology?.inputSchema)).toContain('"path"');
    expect(JSON.stringify(byName.run_query?.inputSchema)).toContain('"body"');
    expect(JSON.stringify(byName.run_query?.inputSchema)).toContain('"type":"string"');
    expect(JSON.stringify(byName.describe?.inputSchema)).toContain('"operation"');
    expect(JSON.stringify(byName.describe?.inputSchema)).not.toContain('"detail":');
    expect(JSON.stringify(byName.describe?.inputSchema)).not.toContain("lens_plan");
  });
});

async function loadCurrentManifest(): Promise<Awaited<ReturnType<Client["listTools"]>>> {
  const server = createSemLangMcpServer();
  const client = new Client({ name: "semlang-manifest-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return await client.listTools();
  } finally {
    await client.close();
    await server.close();
  }
}

function roughTokenCount(text: string): number {
  const pieces = text.match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) ?? [];
  return pieces.reduce((sum, piece) => sum + Math.max(1, Math.ceil(piece.length / 4)), 0);
}

function duplicateAlternateNames(names: string[]): string[] {
  const nameSet = new Set(names);
  return names.filter((name) => name.includes(".") && nameSet.has(name.replaceAll(".", "_")));
}

const oldPublicToolNames = [
  "set_ontology_source",
  "semantic.search_terms",
  "catalog.resolve_entity",
  "ontology.describe_concept",
  "ontology.describe_action",
  "ontology.describe_role",
  "ontology.describe_roles",
  "ontology.explain_metric",
  "ontology.describe_temporal_axes",
  "ontology.find_paths",
  "lens.suggest",
  "lens.describe",
  "lens.expand",
  "lens.required_fields",
  "lens.plan",
  "query.run",
  "action.invoke",
  "reasoning.derive",
];
