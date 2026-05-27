/*
 * Purpose: Implements the SemLang command-line interface and maps CLI commands to compiler, schema, and MCP entry points.
 * Encapsulation: Keep argument parsing, process IO, and command wiring here; compiler behavior, MCP tool logic, and Malloy execution should stay in their dedicated modules.
 */

import fs from "node:fs/promises";
import { Command, Option } from "commander";
import { compileFile, runSemLangMcpStdioServerWithSettings } from "./index.js";
import type { SemLangMcpSettings } from "./mcp-settings.js";
import { generateSemLangConfig, writeSemLangConfig } from "./semlang-config.js";
import { getSemLangVersion } from "./version.js";

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
    .version(getSemLangVersion())
    .description("Compile SemLang semantic models into Malloy or start SemLang MCP mode.");

  app
    .command("compile")
    .description("Compile SemLang semantic models into Malloy.")
    .argument("<file>")
    .option("--out <path>")
    .addOption(new Option("--emit <type>").choices(allowedEmits).default("malloy"))
    .action((file: string, options: CompileOptions) => compileCommand(file, options));

  addSettingsOptions(
    app
      .command("setup")
      .description("Create a SemLang project configuration file.")
      .option("--preview", "Print the generated config without writing it.")
      .option("--force", "Overwrite an existing SemLang config file.")
      .option("--path <file>", "SemLang ontology entrypoint to write into .semlang/settings.yml."),
  ).action((options: SetupOptions, command: Command) => setupCommand(options, command));

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
  updateStats?: boolean;
  completeValueMaxDistinctCount?: string;
  sampleValueMaxCount?: string;
  statsQueryLimitSeconds?: string;
  maxParallelQueries?: string;
  statsCacheDirectory?: string;
}

interface SetupOptions extends SettingsOptions {
  preview?: boolean;
  force?: boolean;
  path?: string;
}

function addSettingsOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--project-dir <path>", "Overrides SEMLANG_PROJECT_DIR.").env("SEMLANG_PROJECT_DIR").hideHelp(),
    )
    .addOption(
      new Option("--malloy-config-path <path>", "Overrides SEMLANG_MALLOY_CONFIG_PATH.").env(
        "SEMLANG_MALLOY_CONFIG_PATH",
      ),
    )
    .addOption(new Option("--config-path <path>", "Alias for --malloy-config-path.").env("SEMLANG_MALLOY_CONFIG_PATH"))
    .addOption(
      new Option("--export-directory <path>", "Overrides SEMLANG_EXPORT_DIRECTORY.").env("SEMLANG_EXPORT_DIRECTORY"),
    )
    .addOption(
      new Option("--update-stats <boolean>", "Overrides SEMLANG_UPDATE_STATS.")
        .env("SEMLANG_UPDATE_STATS")
        .argParser(parseBooleanOption),
    )
    .addOption(new Option("--no-update-stats", "Disable field statistics refresh."))
    .addOption(
      new Option(
        "--complete-value-max-distinct-count <count>",
        "Cache complete value lists for indexed fields at or below this distinct count.",
      ).env("SEMLANG_COMPLETE_VALUE_MAX_DISTINCT_COUNT"),
    )
    .addOption(
      new Option(
        "--sample-value-max-count <count>",
        "Maximum sampled/top values to cache for high-cardinality fields.",
      ).env("SEMLANG_SAMPLE_VALUE_MAX_COUNT"),
    )
    .addOption(
      new Option("--stats-query-limit-seconds <seconds>", "Execution deadline for field statistics queries.").env(
        "SEMLANG_STATS_QUERY_LIMIT_SECONDS",
      ),
    )
    .addOption(
      new Option("--max-parallel-queries <count>", "Maximum concurrent field statistics queries.").env(
        "SEMLANG_MAX_PARALLEL_QUERIES",
      ),
    )
    .addOption(
      new Option("--stats-cache-directory <path>", "Overrides SEMLANG_STATS_CACHE_DIRECTORY.").env(
        "SEMLANG_STATS_CACHE_DIRECTORY",
      ),
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

async function setupCommand(options: SetupOptions, command: Command): Promise<void> {
  const settings = settingsFromOptions(options, command);
  const generated = await generateSemLangConfig({
    cwd: settings.projectDir,
    ontologyPath: options.path,
    malloyConfigPath: settings.malloyConfigPath,
    exportDirectory: settings.exportDirectory,
  });
  if (options.preview) {
    process.stdout.write(generated.contents);
    return;
  }
  await writeSemLangConfig(generated, { force: options.force });
  process.stdout.write(`Wrote ${generated.configPath}\n`);
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
    updateStats: options.updateStats,
    completeValueMaxDistinctCount: numericOption(options.completeValueMaxDistinctCount),
    sampleValueMaxCount: numericOption(options.sampleValueMaxCount),
    statsQueryLimitSeconds: numericOption(options.statsQueryLimitSeconds),
    maxParallelQueries: numericOption(options.maxParallelQueries),
    statsCacheDirectory: options.statsCacheDirectory,
  };
}

function parseBooleanOption(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`Expected a boolean value, received ${value}.`);
}

function numericOption(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
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
