---
title: Reasoning Workflow
sidebar_position: 7
---

# Reasoning Workflow

SemLang does not expose a separate reasoning tool. Agents should compose the compact public tools instead:

- Use `search` to find candidate concepts, members, metrics, queries, lenses, or entities.
- Use `describe` to inspect the selected ontology objects and lens details.
- Use `find_paths` when the route between concepts matters.
- Use `run_query` with `dry_run_only` to validate generated Malloy before execution.

This keeps heuristic planning out of the public manifest while preserving the same workflow through explicit, reviewable tool calls.
