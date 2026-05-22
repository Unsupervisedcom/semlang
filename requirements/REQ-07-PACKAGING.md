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

## 07.03 Published Package Validation

The repository must document and exercise the consumer-facing npm package after publication.

- 07.03.001: The root README MUST document installing SemLang from the published `semlang` npm package.
- 07.03.002: The repository MUST provide a reusable smoke-test utility that installs the published npm package in an isolated temporary project.
- 07.03.003: The published package smoke-test utility MUST validate both the public ESM import surface and the `semlang` CLI entrypoint.
- 07.03.004: The published package smoke-test utility SHOULD clean up its temporary project after validation unless a debugging option asks to keep it.
