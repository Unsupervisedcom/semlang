# SemLang Packages

This public repository contains SemLang package resources for agent tools while
SemLang core source remains private in `Unsupervisedcom/semlang-core`.

Public SemLang documentation lives in `docs/`, supplementary design notes live
in `design-docs/`, and shared documentation/test examples live in `examples/`.
The private core repository consumes these examples directly from this public
package checkout so the examples used in docs and tests stay in one place.

The `skills/` directory is generated from the authoritative
`skills_for_cli_packages/` directory in `semlang-core` during core releases.

## Pi

Install the Pi package from this repository:

```sh
pi install git:https://github.com/Unsupervisedcom/semlang
```

For local development from a `semlang-core` checkout that has this repository as
a submodule:

```sh
pi install "$PWD/packages/semlang"
```

The package explicitly loads the bundled `pi-mcp-adapter` extension from
`node_modules/pi-mcp-adapter/index.ts`. The Pi package exposes all SemLang skills
in `skills/`, including `semlang-setup`, `semlang`, and
`initial-ontology-creation`.

Use the `semlang-setup` skill to inspect or add SemLang MCP configuration. After
MCP config changes, run `/reload` or restart Pi.

## Claude Code

This repository includes the Claude Code plugin manifest in
`.claude-plugin/plugin.json`, an MCP server config in `.mcp.json`, and SemLang
skills in `skills/`.

After adding the public SemLang package repository to a Claude Code plugin
marketplace, install it with:

```sh
claude plugin install semlang@semlang
```

If your marketplace entry uses a different marketplace name, replace the final
`semlang` after `@` with that name.

SemLang MCP starts with the published SemLang package, pinned to this package
version, for example `npx -y semlang@0.1.3 mcp`.

SemLang MCP respects `SEMLANG_*` environment settings. Run `semlang setup` to
inspect resolved SemLang project settings.
