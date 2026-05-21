/*
 * Purpose: Configures the SemLang documentation site and local raw-skill import plugin.
 * Encapsulation: Keep Docusaurus site metadata, navigation, and docs build hooks here; documentation content belongs under docs-site/docs.
 */

import type { Config } from "@docusaurus/types";
import type { Preset } from "@docusaurus/preset-classic";

const config: Config = {
  title: "SemLang",
  tagline: "Semantic analytics language reference",
  url: "http://localhost",
  baseUrl: "/",
  organizationName: "semlang",
  projectName: "semlang",
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: undefined,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    function rawSkillFilePlugin() {
      return {
        name: "raw-skill-file-loader",
        configureWebpack() {
          return {
            module: {
              rules: [
                {
                  resourceQuery: /raw/,
                  type: "asset/source",
                },
              ],
            },
          };
        },
      };
    },
  ],
  themeConfig: {
    navbar: {
      title: "SemLang",
      items: [
        {
          type: "docSidebar",
          sidebarId: "languageReference",
          position: "left",
          label: "Language Reference",
        },
        {
          type: "doc",
          docId: "mcp-server/index",
          position: "left",
          label: "MCP Server",
        },
      ],
    },
    footer: {
      style: "dark",
      copyright: `Copyright © ${new Date().getFullYear()} SemLang`,
    },
    prism: {
      additionalLanguages: ["sql"],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
