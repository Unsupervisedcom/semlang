/*
 * Purpose: Covers compiler diagnostics for semantic type metadata.
 * Encapsulation: Keep type metadata diagnostics here; broader compiler projection coverage lives in compiler metadata tests.
 */

import { describe, expect, it } from "vitest";
import { compileSemLang } from "../src/index.js";

describe("SemLang compiler type metadata", () => {
  it("01.01.005 diagnoses legacy and malformed type metadata", async () => {
    const result = await compileSemLang(`
package bad.type_metadata

type: Status is string {
  allowed_values: ['active']
}

type: BrokenEnum is string {
  enum: { value: 'active' }
}

concept A is kind from duckdb.table('a') {
  identity id :: string
}
`);
    expect(result.model).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "LEGACY_TYPE_METADATA",
      "INVALID_TYPE_METADATA",
    ]);
  });
});
