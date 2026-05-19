import type { Config } from "@docusaurus/types";
import type { Preset } from "@docusaurus/preset-classic";

const config: Config = {
  title: "OntoQL",
  tagline: "Semantic analytics language reference",
  url: "http://localhost",
  baseUrl: "/",
  organizationName: "ontoql",
  projectName: "ontoql",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn"
    }
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: undefined
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css"
        }
      } satisfies Preset.Options
    ]
  ],
  themeConfig: {
    navbar: {
      title: "OntoQL",
      items: [
        {
          type: "docSidebar",
          sidebarId: "languageReference",
          position: "left",
          label: "Language Reference"
        }
      ]
    },
    footer: {
      style: "dark",
      copyright: `Copyright © ${new Date().getFullYear()} OntoQL`
    },
    prism: {
      additionalLanguages: ["sql"]
    }
  } satisfies Preset.ThemeConfig
};

export default config;
