---
title: Configuration
sidebar_position: 2
---

# Configuration

SemLang projects use a project-local `.semlang/settings.yml` file.
Normal MCP use should not pass project roots or model path arrays to tools; run setup once, then let the server discover this file.

```bash
semlang setup
```

The generated file is intentionally small:

```yaml
ontology:
  entrypoint: models/model.semlang

malloy:
  configPath: malloy-config.json

exportDirectory: .semlang/exports
```

The minimal hand-written config is:

```yaml
ontology:
  entrypoint: model.semlang
```

SemLang also uses the `.semlang` directory for managed local state such as stats caches and default row exports.
`settings.yml` is the durable project config inside that directory; generated cache contents remain under `.semlang/cache`.

## Setup

`semlang setup` creates `.semlang/settings.yml` in the current project directory.
If a config already exists above the current directory, setup uses that directory's parent as the project root.

Useful options:

- `--preview` prints the generated YAML without writing it.
- `--force` overwrites an existing `.semlang/settings.yml`.
- `--path <file>` chooses the SemLang ontology entrypoint when discovery is ambiguous.
- `--malloy-config-path <file>` or `--config-path <file>` writes an explicit Malloy config path.
- `--export-directory <dir>` writes an explicit export directory.

Setup discovers ontology entrypoints in this order: `--path`, `model.semlang`, `semlang.semlang`, `models/model.semlang`, then a single shallow `.semlang` file candidate.
If multiple candidates exist, setup reports them and asks for `--path`.

Setup discovers Malloy config from the ontology entrypoint directory up to the SemLang project root, checking `malloy-config-local.json` before `malloy-config.json`.
If none is found, `malloy.configPath` is omitted.

## Runtime Discovery

`semlang mcp` starts even when `.semlang/settings.yml` does not exist.
Tool calls that need project config, including `load_ontology({})`, return setup guidance until the config is created.

Once configured, agents should load the ontology with an empty request:

```json
{}
```

Relative paths in `.semlang/settings.yml` resolve from the project root, which is the directory containing `.semlang`.
This keeps `ontology.entrypoint: model.semlang` pointed at `<project>/model.semlang`.

## Malloy Config

SemLang does not inline Malloy connection configuration.
`malloy-config.json` and `malloy-config-local.json` are standard Malloy config files, so SemLang references them from `.semlang/settings.yml` when needed.

Use `malloy-config-local.json` for machine-local credentials or paths and keep it out of version control.

## Compatibility

The MCP runtime still accepts legacy `paths`, `projectDir`, `configPath`, and `malloyConfigPath` arguments for a transition period.
New docs and agents should use `semlang setup` and `load_ontology({})` instead.
