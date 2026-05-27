---
name: semlang-suggestion-review
description: Review and steward local SemLang issue and workflow notes configured under .agents/local/. Use when the user asks to review SemLang bugs/issues, workflow suggestions, decide whether to implement one, implement an approved item through a sub-agent, or update item statuses as Implemented/Resolved, deferred with inline notes, or Rejected.
---

# SemLang Issue and Suggestion Review

## Overview

Use this workflow to help the user evaluate and process SemLang improvement notes from local, gitignored note files:

- `.agents/local/semlang_issues.md`
- `.agents/local/semlang_workflow_suggestions.md`

These files may be symlinks to private maintainer notes outside the repository. If either file is missing, ask the user to create the local file or symlink before continuing, or ask them to provide the alternate path for this run.

Choose the target file from the user's wording:

- If the user says "bugs", "issues", "bug file", "issue log", "compiler", "diagnostic", "lint", "warning", "error", or asks about SemLang behavior that should change, use `semlang_issues.md`.
- If the user says "workflow", "suggestions", "best practices", or asks about modeling process guidance, use `semlang_workflow_suggestions.md`.
- If the user is ambiguous, inspect both files and say which file you think contains the relevant item before implementation.

The expected loop is: read the relevant file, discuss candidate items with a clear recommendation, wait for explicit user approval, spawn a sub-agent to implement the approved item, review the implementation yourself, then update the same file's status.

## Workflow

1. Read the relevant file before making recommendations. For bug/issue work, this is usually `.agents/local/semlang_issues.md`; for workflow guidance, this is usually `.agents/local/semlang_workflow_suggestions.md`. Preserve the user's existing wording and structure when editing either file.
2. Identify the relevant unprocessed issue or suggestion. If the user did not name one, choose a sensible next candidate and explain why.
3. Talk with the user before implementation. For each candidate, give:
   - whether it seems like a good idea
   - the practical value or risk
   - important implementation notes, dependencies, or open questions
   - a concise recommendation: approve, defer, reject, or clarify
4. Ask for explicit approval before implementation. Make clear that approving means a sub-agent will be spawned to implement that specific item unless the user has explicitly asked you to implement directly.
5. After approval, spawn a sub-agent for implementation unless the user explicitly asks you to implement directly. Give it a concrete, bounded task, point it to the issue/suggestion text and relevant repository context, and instruct it to change files directly, avoid reverting unrelated work, and report changed paths.
6. Review the sub-agent's result yourself. Inspect the diff and run appropriate verification for the change. If it does not meet the need, fix it locally or send a follow-up task to the same sub-agent if that is the better path.
7. Update the same source file only after the decision or implementation status is known:
   - In `semlang_issues.md`, if implemented and verified, mark the issue title as resolved using the existing style: `## ~~Title~~ (Resolved)`, add `| **Resolved:** YYYY-MM-DD` to the date line, and add a short status paragraph if useful.
   - In `semlang_workflow_suggestions.md`, if implemented and verified, move the item into an `Implemented` section, preserving enough detail to explain what was done.
   - If deferred or not now, keep the item in place and append an inline status note with the decision date, reason, and any revisit condition.
   - If permanently rejected, move the item into a `Rejected` section with a short reason.

## Editing The Files

For `semlang_workflow_suggestions.md`, create `## Implemented` or `## Rejected` sections if they do not already exist. Prefer appending moved items under the relevant section rather than deleting their history.

For `semlang_issues.md`, preserve the issue-log style. Prefer striking through resolved issue titles and adding a resolved date over moving issues to a separate section, unless the file already establishes a different pattern.

Use concise status notes, for example:

```markdown
Status: Deferred on 2026-05-20 because <reason>. Revisit when <condition>.
```

```markdown
Status: Rejected on 2026-05-20 because <reason>.
```

Use the current local date when writing status notes. Keep changes focused on the item being processed.

## Sub-Agent Prompt Shape

When spawning the implementation sub-agent, include:

- The exact issue/suggestion text or a precise excerpt from the source file
- The intended outcome in user-facing terms
- The repository path to work in
- Ownership boundaries for files or modules when known
- The requirement to avoid reverting unrelated edits
- The expected final report: summary, changed paths, verification run, and any unresolved issues

Do not spawn a sub-agent merely to evaluate an idea. Use sub-agents only after the user has explicitly approved implementation of a specific item, unless the user directly asks you to implement without delegation.
