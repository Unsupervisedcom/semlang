import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateMalloyModel } from "../src/malloy-execution.js";

async function writeMalloyConfig(projectDir: string): Promise<string> {
  const configPath = path.join(projectDir, "malloy-config.json");
  await fs.writeFile(configPath, JSON.stringify({
    connections: {
      duckdb: {
        is: "duckdb",
        workingDirectory: projectDir,
        extensionDirectory: path.join(projectDir, ".duckdb-extensions")
      }
    }
  }, null, 2));
  return configPath;
}

describe("Malloy SDK validation", () => {
  it("converts Malloy model problems into SemLang diagnostics", async () => {
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "semlang-malloy-validation-"));
    const malloyConfigPath = await writeMalloyConfig(projectDir);
    const diagnostics = await validateMalloyModel({
      context: { projectDir, malloyConfigPath },
      malloy: `
source: accounts is duckdb.sql("""select 'A1' as account_id, date '2026-05-01' as last_order_date""") extend {
  primary_key: account_id

  dimension:
    days_since_last_order is days(now() - last_order_date)
}
`
    });

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "error",
        code: "MALLOY_VALIDATION_ERROR",
        message: expect.stringContaining("Malloy validation")
      })
    ]));
    expect(diagnostics[0]?.location).toMatchObject({
      file: "generated.malloy",
      line: expect.any(Number),
      column: expect.any(Number)
    });
  });
});
