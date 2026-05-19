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
        "language-reference/expressions",
        "language-reference/lenses",
        "language-reference/diagnostics-lowering",
        "language-reference/agent-instructions"
      ]
    }
  ]
};

export default sidebars;
