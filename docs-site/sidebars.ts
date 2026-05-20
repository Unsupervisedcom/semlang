import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  languageReference: [
    {
      type: "category",
      label: "Language Reference",
      link: {
        type: "doc",
        id: "language-reference/index"
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
        "language-reference/agent-instructions",
        "language-reference/supported_malloy_features"
      ]
    },
    {
      type: "category",
      label: "MCP Server",
      link: {
        type: "doc",
        id: "mcp-server/index"
      },
      items: [
        "mcp-server/tools-overview",
        "mcp-server/source-and-search",
        "mcp-server/ontology-tools",
        "mcp-server/lens-tools",
        "mcp-server/query-and-action-tools",
        "mcp-server/reasoning-tools"
      ]
    }
  ]
};

export default sidebars;
