/*
 * Purpose: Defines the documentation site's sidebar hierarchy.
 * Encapsulation: Keep docs navigation structure here; page content and generated docs behavior belong in docs-site/docs and docusaurus.config.ts.
 */

import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  languageReference: [
    "semlang-concepts",
    {
      type: "category",
      label: "Language Reference",
      link: {
        type: "doc",
        id: "language-reference/index",
      },
      items: [
        "language-reference/concepts",
        "language-reference/declarations",
        "language-reference/sources",
        "language-reference/expressions",
        "language-reference/lenses",
        "language-reference/actions",
        "language-reference/diagnostics-lowering",
        "language-reference/schema-vocabulary",
        "language-reference/skill",
        "language-reference/supported_malloy_features",
      ],
    },
    {
      type: "category",
      label: "MCP Server",
      link: {
        type: "doc",
        id: "mcp-server/index",
      },
      items: [
        "mcp-server/configuration",
        "mcp-server/tools-overview",
        "mcp-server/source-and-search",
        "mcp-server/ontology-tools",
        "mcp-server/lens-tools",
        "mcp-server/query-and-action-tools",
        "mcp-server/reasoning-tools",
        "mcp-server/malloy-connections",
      ],
    },
  ],
};

export default sidebars;
