import fs from "node:fs/promises";
import { Command } from "commander";
import { compileFile } from "./index.js";

const program = new Command();

program
  .name("ontoql")
  .description("Compile OntoQL semantic models into Malloy.")
  .version("0.1.0");

program
  .command("compile")
  .argument("<file>", "OntoQL file to compile")
  .option("--out <file>", "Output file")
  .option("--source-mode <mode>", "Malloy source mode: bare or duckdb", "bare")
  .option("--emit <kind>", "Artifact to emit: ast, model, or malloy", "malloy")
  .action(async (file: string, options: { out?: string; sourceMode: "bare" | "duckdb"; emit: "ast" | "model" | "malloy" }) => {
    const result = await compileFile(file, { sourceMode: options.sourceMode });
    if (result.diagnostics.length > 0) {
      for (const diagnostic of result.diagnostics) {
        const loc = diagnostic.location ? `${diagnostic.location.file ?? "<input>"}:${diagnostic.location.line}:${diagnostic.location.column}` : "<input>";
        console.error(`${loc} ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`);
      }
    }
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      process.exitCode = 1;
      return;
    }
    const output = artifact(result, options.emit);
    if (options.out) await fs.writeFile(options.out, output);
    else process.stdout.write(output);
  });

function artifact(result: Awaited<ReturnType<typeof compileFile>>, emit: "ast" | "model" | "malloy"): string {
  if (emit === "ast") return `${JSON.stringify(result.ast, null, 2)}\n`;
  if (emit === "model") {
    return `${JSON.stringify(result.model, (_key, value) => {
      if (value instanceof Map) return Object.fromEntries(value);
      if (value instanceof Set) return [...value];
      return value;
    }, 2)}\n`;
  }
  return result.malloy ?? "";
}

program.parseAsync().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
