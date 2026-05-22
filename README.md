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
  identity customer_id :: CustomerId
  field:
    name :: string
  measure:
    rows is count()
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
