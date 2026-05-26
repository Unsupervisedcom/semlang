# REQ-07-PACKAGING: Package Release and Distribution

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern the npm package metadata and GitHub release automation for SemLang distribution.

## 07.01 npm Package Metadata

The npm package must expose the built CLI and library entrypoints under the public package name.

- 07.01.001: The root npm package MUST be named `semlang`.
- 07.01.002: The root npm package MUST be publishable to the public npm registry and MUST NOT be marked private.
- 07.01.003: The root npm package MUST expose the `semlang` CLI command.
- 07.01.004: The root npm package MUST publish built JavaScript and declaration artifacts for library consumers.
- 07.01.005: Published JavaScript artifacts SHOULD be obfuscated with a Node-compatible js-confuser configuration that avoids runtime-lock features likely to break CLI or library consumers.
- 07.01.006: Runtime version surfaces such as the CLI and MCP server MUST resolve their version from package metadata so releases require a single package version update.

## 07.02 Release Publishing

GitHub releases are the distribution boundary for npm publication.

- 07.02.001: Publishing to npm MUST run only when a GitHub release is published.
- 07.02.002: The release workflow MUST validate the package before publication.
- 07.02.003: The release workflow MUST authenticate to npm with the repository `NPM_TOKEN` secret.
- 07.02.004: The release workflow MUST NOT request npm provenance while the source repository is private because npm provenance only supports public GitHub repositories.
- 07.02.005: The release workflow MUST publish the obfuscated release build rather than the plain TypeScript compiler output.
- 07.02.006: The release workflow MUST explicitly publish the package with public npm access.
- 07.02.007: The release workflow MUST synchronize package, plugin, lockfile, and MCP package-spec versions from the GitHub release tag before validation and publication.

## 07.03 Published Package Validation

The repository must document and exercise the consumer-facing npm package after publication.

- 07.03.001: The root README MUST document installing SemLang from the published `semlang` npm package.
- 07.03.002: The repository MUST provide a reusable smoke-test utility that installs the published npm package in an isolated temporary project.
- 07.03.003: The published package smoke-test utility MUST validate both the public ESM import surface and the `semlang` CLI entrypoint.
- 07.03.004: The published package smoke-test utility SHOULD clean up its temporary project after validation unless a debugging option asks to keep it.

## 07.04 Claude Code Plugin Distribution

The npm package must also act as a Claude Code plugin so SemLang skills and MCP tools can be installed from the same artifact as the CLI.

- 07.04.001: The npm package MUST publish a Claude Code plugin manifest at `.claude-plugin/plugin.json`.
- 07.04.002: The Claude Code plugin manifest MUST use the `semlang` plugin namespace and MUST version the plugin with the root npm package version.
- 07.04.003: The Claude Code plugin MUST expose the canonical SemLang skill set from the conventional `skills` directory at the plugin root so Claude Code auto-discovers them.
- 07.04.004: The plugin manifest MUST NOT specify explicit `skills` or `mcpServers` paths and MUST rely on Claude Code convention-based auto-discovery of the `skills` directory and `.mcp.json` file.
- 07.04.005: The Claude Code plugin MUST expose a `semlang` MCP server via an auto-discovered `.mcp.json` that starts MCP stdio mode through an npm package spec pinned to the root npm package version.
- 07.04.006: The Claude Code plugin release version, root npm package version, lockfile root version, and pinned MCP package spec MUST be synchronized by the release version utility.
- 07.04.007: The Claude Code plugin MUST include a `pull_and_review` skill that defines the Copilot pull-request review loop for opening PRs, waiting for review comments, addressing valid feedback, resolving addressed threads, re-requesting review, and reporting disputed unresolved comments.
