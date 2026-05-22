/*
 * Purpose: Covers include graph behavior and combined compiler diagnostics.
 * Encapsulation: Keep include-specific compiler assertions here; source metadata and parser basics have separate test files.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileSemLang, parseSemLang } from "../src/index.js";

describe("SemLang compiler includes and combined diagnostics", () => {
  // 02.02.007: include-once semantics allow diamond include graphs without
  // merging declarations from the shared dependency more than once.
  it("deduplicates diamond includes by resolved file path", async () => {
    const files = new Map([
      [
        "/work/types.semlang",
        `
package diamond.types
type: AccountId is string {
}
`,
      ],
      [
        "/work/fans.semlang",
        `
package diamond.fans
include "./types.semlang"
concept Fan is kind from duckdb.table('fans') {
  identity fan_id :: AccountId
}
`,
      ],
    ]);

    const result = await compileSemLang(
      `
package diamond.root
include "./types.semlang"
include "./fans.semlang"
concept Account is kind from duckdb.table('accounts') {
  identity account_id :: AccountId
}
`,
      {
        filePath: "/work/root.semlang",
        packageLoader: {
          load(includePath, fromFile) {
            const filePath = path.resolve(path.dirname(fromFile ?? "/work/root.semlang"), includePath);
            const source = files.get(filePath);
            if (!source) throw new Error(`Missing test fixture ${filePath}`);
            return { filePath, source };
          },
        },
      },
    );

    expect(result.diagnostics).toEqual([]);
    expect([...result.model!.types.keys()]).toEqual(["AccountId"]);
    expect(result.model!.files).toEqual(["/work/types.semlang", "/work/fans.semlang", "/work/root.semlang"]);
  });

  // 02.02.007: shared include files are parsed once even when they contain
  // errors, so diagnostics do not repeat through diamond paths.
  it("does not duplicate diagnostics from invalid diamond includes", async () => {
    const files = new Map([
      [
        "/work/shared.semlang",
        `
package diamond.shared
not a declaration
`,
      ],
      [
        "/work/fans.semlang",
        `
package diamond.fans
include "./shared.semlang"
concept Fan is kind from duckdb.table('fans') {
  identity fan_id :: string
}
`,
      ],
    ]);

    const result = await compileSemLang(
      `
package diamond.root
include "./shared.semlang"
include "./fans.semlang"
concept Account is kind from duckdb.table('accounts') {
  identity account_id :: string
}
`,
      {
        filePath: "/work/root.semlang",
        packageLoader: {
          load(includePath, fromFile) {
            const filePath = path.resolve(path.dirname(fromFile ?? "/work/root.semlang"), includePath);
            const source = files.get(filePath);
            if (!source) throw new Error(`Missing test fixture ${filePath}`);
            return { filePath, source };
          },
        },
      },
    );

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["UNEXPECTED_TOP_LEVEL"]);
    expect(result.diagnostics[0]?.location?.file).toBe("/work/shared.semlang");
  });

  it("diagnoses duplicate symbols, roles, lenses, temporal misuse, and include cycles", async () => {
    const duplicate = await compileSemLang(`
package bad.duplicates
type: Id is string {
}
type: Id is string {
}
concept A is kind from duckdb.table('a') {
  identity id :: Id
  field:
    id :: Id
}
lens: l is {
  refine: Missing extend {
    where: id is MissingRole
  }
}
query: q is A with missing_lens -> {
  where: id is MissingRole
  aggregate:
    rows is count()
}
`);
    expect(duplicate.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "DUPLICATE_TYPE",
      "DUPLICATE_FIELD",
      "UNKNOWN_REFINEMENT_TARGET",
      "UNKNOWN_LENS",
    ]);

    const unknownRole = await compileSemLang(`
package bad.role
type: Id is string {
}
concept A is kind from duckdb.table('a') {
  identity id :: Id
}
query: q is A -> {
  where: id is MissingRole
  aggregate:
    rows is count()
}
`);
    expect(unknownRole.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["UNKNOWN_ROLE"]);

    const temporal = await compileSemLang(`
package bad.temporal
type: Id is string {
}
concept A is kind from duckdb.table('a') {
  identity id :: Id
}
concept B is kind from duckdb.table('b') {
  identity id :: Id
  join_one a: A on id at id
}
`);
    expect(temporal.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["INVALID_TEMPORAL_JOIN"]);

    const parsed = parseSemLang(`package cycle\ninclude "./self.semlang"\n`, { filePath: "/tmp/self.semlang" });
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.ast).toMatchObject({ packageName: "cycle" });
    const cycle = await compileSemLang(`package cycle\ninclude "./self.semlang"\n`, {
      filePath: "/tmp/self.semlang",
      packageLoader: {
        load() {
          return { filePath: "/tmp/self.semlang", source: `package cycle\ninclude "./self.semlang"\n` };
        },
      },
    });
    expect(cycle.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["INCLUDE_CYCLE"]);
  });
});
