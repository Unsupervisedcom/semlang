---
name: semlang-setup
description: Inspect and configure SemLang MCP for the current Pi project. Use when SemLang MCP is missing, broken, or needs project-local Pi setup.
---

# SemLang Setup for Pi

Use this skill to help a user configure SemLang MCP in the current project.
Keep the setup minimal: this package loads `pi-mcp-adapter`; the skill only
helps manage MCP JSON configuration.

## Workflow

1. Inspect existing MCP config files, when present:
   - `.pi/mcp.json`
   - `.mcp.json`
   - optionally `~/.pi/agent/mcp.json`
   - optionally `~/.config/mcp/mcp.json`
2. Determine whether any inspected config already defines
   `mcpServers.semlang`.
3. If a `semlang` MCP server already exists, summarize where it was found and
   do not add another server unless the user explicitly asks.
4. If SemLang MCP is missing, propose adding project-local Pi config at
   `.pi/mcp.json`. Prefer this Pi-owned project config unless an existing
   `.mcp.json` already has, or clearly should have, the SemLang config.
5. Ask for user confirmation before creating or editing MCP config unless the
   user has already explicitly authorized the edit.
6. Preserve existing MCP config contents. Merge only the missing
   `mcpServers.semlang` entry and keep other servers/settings unchanged.
7. After writing config, tell the user to run `/reload` or restart Pi.
8. Mention that SemLang MCP respects `SEMLANG_*` environment settings and that
   `semlang setup` can inspect resolved SemLang settings.

## Server snippet

Unless a project-local SemLang binary strategy is explicitly requested and is
more reliable for the project, add this server entry pinned to the package
version:

```json
{
  "mcpServers": {
    "semlang": {
      "command": "npx",
      "args": ["-y", "semlang@0.1.3", "mcp"],
      "lifecycle": "lazy"
    }
  }
}
```

For an existing config file, merge the `semlang` object under the existing
`mcpServers` object instead of replacing the file.
