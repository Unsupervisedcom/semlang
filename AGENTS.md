# Repository Instructions

- Use `npm run check` for full validation before handing off changes; it runs formatting checks, lint, and tests.
- Use `npm run fix` to apply automatic ESLint and Prettier fixes before committing when style or lint issues appear.
- To request a Copilot PR review, assign `@copilot` as a reviewer. To re-request one, remove and re-add it, for example `gh pr edit <number> --remove-reviewer @copilot` then `gh pr edit <number> --add-reviewer @copilot`.
- When adding or changing behavior, update the relevant requirement file and add explicit tests. Test comments must cite the requirement numbers they cover, for example `05.07.009`.
- When designing or changing SemLang syntax, err on the side of Malloy-like syntax where reasonable.
- Any SemLang MCP setting the code needs must be managed through the `SEMLANG_*` environment variable and matching CLI/tool parameter mechanism; use `semlang setup` to inspect resolved settings and `semlang mcp` to start MCP mode.
- Keep the skill surfaces distinct. Root `skills/` contains skills distributed by the SemLang plugin/package, such as ontology-creation guidance for downstream SemLang users. Repo-local workflow skills for working on this repository itself should live under `.agents/skills/` so Codex discovers them as project skills; examples include PR review loops, issue/suggestion triage, or other maintainer workflows. Do not move maintainer-only workflows into root `skills/` unless they should ship to plugin consumers.
