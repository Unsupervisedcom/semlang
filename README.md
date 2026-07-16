# SemLang

SemLang is a semantic analytics language that compiles into [Malloy](https://www.malloydata.dev/).
It adds a formal ontology layer beside Malloy-style dimensions, measures, and
queries: concept stereotypes (`kind`, `event`, `situation`, `relator`, `phase`,
`role`), semantic types, temporal axes, validation predicates, query-time
`lens` overlays, and declarative `action` write operations. The goal is to
give AI agents a governed view of business data, so they query concepts
instead of guessing at raw tables.

Start with [SemLang concepts](docs/semlang-concepts.md) for modeling guidance,
then the [language reference](docs/language-reference/) for syntax, the
[MCP server docs](docs/mcp-server/) for the tools agents use (`load_ontology`,
`search`, `describe`, `find_paths`, `run_query`, `invoke_action`), and the
[examples](examples/): five worked ontologies (healthcare, banking, retail,
SaaS, manufacturing), each with a schema, sample data, and a model.

The SemLang compiler and runtime are developed in the private
`Unsupervisedcom/semlang-core` repository. This public repository carries
everything needed to use SemLang with agent tools: documentation, design
notes, examples, and the Pi and Claude Code packages.

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

## Repository layout

Public SemLang documentation lives in `docs/`, supplementary design notes live
in `design-docs/`, and shared documentation/test examples live in `examples/`.
The private core repository consumes these examples directly from this public
package checkout so the examples used in docs and tests stay in one place.
The `skills/` directory is generated from the authoritative
`skills_for_cli_packages/` directory in `semlang-core` during core releases.

## License

MIT. See [LICENSE](LICENSE).
