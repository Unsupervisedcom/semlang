/*
 * Purpose: Implements the SemLang command-line interface and maps CLI commands to compiler, schema, and MCP entry points.
 * Encapsulation: Keep argument parsing, process IO, and command wiring here; compiler behavior, MCP tool logic, and Malloy execution should stay in their dedicated modules.
 */

import fs from "node:fs/promises";
import { Command, Option } from "commander";
import { compileFile, resolveSemLangMcpSettings, runSemLangMcpStdioServerWithSettings } from "./index.js";
import type { SemLangMcpSettings } from "./mcp.js";

const allowedEmits = ["ast", "model", "malloy", "json-schema"] as const;
type CompileEmit = (typeof allowedEmits)[number];

const program = createProgram();

async function main(argv: string[]): Promise<void> {
  if (argv.length === 0) program.help();
  await program.parseAsync(argv, { from: "user" });
}

function createProgram(): Command {
  const app = new Command()
    .name("semlang")
    .version("0.1.0")
    .description("Compile SemLang semantic models into Malloy or start SemLang MCP mode.");

  app
    .command("compile")
    .description("Compile SemLang semantic models into Malloy.")
    .argument("<file>")
    .option("--out <path>")
    .addOption(new Option("--emit <type>").choices(allowedEmits).default("malloy"))
    .action((file: string, options: CompileOptions) => compileCommand(file, options));

  addSettingsOptions(app.command("setup").description("Print resolved MCP settings.")).action(
    (options: SettingsOptions, command: Command) => setupCommand(options, command),
  );

  addSettingsOptions(app.command("mcp").description("Start SemLang in MCP stdio mode.")).action(
    (options: SettingsOptions, command: Command) => mcpCommand(options, command),
  );

  return app;
}

interface CompileOptions {
  out?: string;
  emit: CompileEmit;
}

interface SettingsOptions {
  projectDir?: string;
  malloyConfigPath?: string;
  configPath?: string;
  exportDirectory?: string;
}

function addSettingsOptions(command: Command): Command {
  return command
    .addOption(new Option("--project-dir <path>", "Overrides SEMLANG_PROJECT_DIR.").env("SEMLANG_PROJECT_DIR"))
    .addOption(
      new Option("--malloy-config-path <path>", "Overrides SEMLANG_MALLOY_CONFIG_PATH.").env(
        "SEMLANG_MALLOY_CONFIG_PATH",
      ),
    )
    .addOption(new Option("--config-path <path>", "Alias for --malloy-config-path.").env("SEMLANG_MALLOY_CONFIG_PATH"))
    .addOption(
      new Option("--export-directory <path>", "Overrides SEMLANG_EXPORT_DIRECTORY.").env("SEMLANG_EXPORT_DIRECTORY"),
    );
}

async function compileCommand(file: string, options: CompileOptions): Promise<void> {
  const emit = options.emit;
  const result = await compileFile(file, { lintWarnings: true });
  if (result.diagnostics.length > 0) {
    for (const diagnostic of result.diagnostics) {
      const loc = diagnostic.location
        ? `${diagnostic.location.file ?? "<input>"}:${diagnostic.location.line}:${diagnostic.location.column}`
        : "<input>";
      console.error(`${loc} ${diagnostic.severity.toUpperCase()} ${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    process.exitCode = 1;
    return;
  }
  const output = artifact(result, emit);
  if (options.out) await fs.writeFile(options.out, output);
  else process.stdout.write(output);
}

function setupCommand(options: SettingsOptions, command: Command): void {
  process.stdout.write(
    `${JSON.stringify(resolveSemLangMcpSettings(settingsFromOptions(options, command)), null, 2)}\n`,
  );
}

async function mcpCommand(options: SettingsOptions, command: Command): Promise<void> {
  await runSemLangMcpStdioServerWithSettings(settingsFromOptions(options, command));
}

function settingsFromOptions(options: SettingsOptions, command: Command): Partial<SemLangMcpSettings> {
  const malloyConfigPath =
    command.getOptionValueSource("malloyConfigPath") === "cli"
      ? options.malloyConfigPath
      : command.getOptionValueSource("configPath") === "cli"
        ? options.configPath
        : (options.malloyConfigPath ?? options.configPath);
  return {
    projectDir: options.projectDir,
    malloyConfigPath,
    exportDirectory: options.exportDirectory,
  };
}

function artifact(
  result: Awaited<ReturnType<typeof compileFile>>,
  emit: "ast" | "model" | "malloy" | "json-schema",
): string {
  if (emit === "ast") return `${JSON.stringify(result.ast, null, 2)}\n`;
  if (emit === "json-schema") return `${JSON.stringify(result.jsonSchema, null, 2)}\n`;
  if (emit === "model") {
    return `${JSON.stringify(
      result.model,
      (_key, value) => {
        if (value instanceof Map) return Object.fromEntries(value);
        if (value instanceof Set) return [...value];
        return value;
      },
      2,
    )}\n`;
  }
  return result.malloy ?? "";
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
