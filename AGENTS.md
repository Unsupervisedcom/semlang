# Repository Instructions

- Use `npm run check` for full validation before handing off changes; it runs formatting checks, lint, and tests.
- Use `npm run fix` to apply automatic ESLint and Prettier fixes before committing when style or lint issues appear.
- When adding or changing behavior, update the relevant requirement file and add explicit tests. Test comments must cite the requirement numbers they cover, for example `05.07.009`.
- When designing or changing SemLang syntax, err on the side of Malloy-like syntax where reasonable.
- Any SemLang MCP setting the code needs must be managed through the `SEMLANG_*` environment variable and matching CLI/tool parameter mechanism; use `semlang setup` to inspect resolved settings and `semlang mcp` to start MCP mode.
