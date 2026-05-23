# SemLang

SemLang is a semantic modeling language that compiles business concepts,
relationships, lenses, and queries into Malloy.

## Install

Use npm to install the published package:

```sh
npm install semlang
```

For command-line use, install the package globally or invoke it from a project
dependency:

```sh
npm install --global semlang
semlang --help
```

SemLang requires Node.js 20 or newer.

## Library Usage

```js
import { compileSemLang } from "semlang";

const result = await compileSemLang(`
package demo.customers

type: CustomerId is string {
}

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: CustomerId {
    description: "Stable customer key."
  }
  field:
    name :: string {
      description: "Display name for the customer."
    }
  measure:
    rows is count() {
      description: "Count of customer rows."
    }
}

query: customer_rollup is Customer -> {
  aggregate:
    rows
}
`);

console.log(result.malloy);
```

## CLI Usage

```sh
semlang compile model.semlang --emit malloy
semlang setup
semlang mcp
```

MCP path settings are configured with `SEMLANG_*` environment variables or the
matching CLI parameters exposed by `semlang setup` and `semlang mcp`.

## Claude Code Plugin

The published npm package also contains a Claude Code plugin manifest, SemLang
skills, and MCP configuration. Add SemLang to a Claude Code plugin marketplace
with an npm source entry:

```json
{
  "name": "semlang",
  "source": {
    "source": "npm",
    "package": "semlang",
    "version": "<release-version>"
  }
}
```

Then install it from that marketplace:

```sh
claude plugin marketplace add <marketplace-source>
claude plugin install semlang@<marketplace-name>
```

Use `--scope project` or `--scope local` with `claude plugin install` when you
want to install SemLang somewhere other than the user-level plugin scope.

The release workflow pins the plugin MCP server to the published package version
with `npx -y semlang@<release-version> mcp`, so it does not require a separate
global `semlang` binary.
