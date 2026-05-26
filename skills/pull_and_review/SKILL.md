---
name: pull_and_review
description: Use when asked to open or continue a pull request review loop with GitHub Copilot, including creating the PR if needed, waiting for Copilot comments, addressing valid feedback, resolving addressed threads, re-requesting Copilot review, and reporting any disputed unresolved comments.
---

# Pull And Review

Use this skill when the user asks for `/pull_and_review` or asks to run the Copilot PR review loop.

## Workflow

1. Confirm the current branch and working tree state. If there is uncommitted work that belongs to the PR, validate it, commit it, and push the branch.
2. Open a pull request for the current branch if one is not already open. Reuse an existing open PR for the branch when present.
3. Request a review from `@copilot`.
4. Wait about 4 minutes for Copilot Review comments. Poll the PR review state and review threads instead of assuming silence means completion.
5. Read each Copilot comment in context. Address comments that are correct, useful, or low-risk improvements aligned with the PR's intent. Do not churn unrelated code.
6. For each addressed comment, make the fix, add or update tests when behavior changes, run the repo's validation command, commit, and push.
7. Mark only the addressed Copilot review threads as resolved after the fixing commit is pushed.
8. Request another review from `@copilot` and repeat the wait/read/fix/push/resolve loop until there are no remaining actionable Copilot issues.
9. If a remaining Copilot comment is wrong or not worth changing, reply on that thread with a concise technical explanation and leave the thread open. In the local conversation, provide links to those open threads so the user can review them.

## Review Judgement

- Prefer fixing clear correctness, test, maintainability, security, performance, or documentation issues.
- Be skeptical of comments that conflict with project requirements, existing architecture, or the PR's narrow scope.
- Resolve threads only after the pushed code actually addresses them.
- Keep the user updated during waits and after each iteration with the PR URL, validation status, and any open disputed thread links.
