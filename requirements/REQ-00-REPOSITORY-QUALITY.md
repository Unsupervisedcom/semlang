# REQ-00-REPOSITORY-QUALITY: Repository Quality Gates

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern repository-level validation rules that keep SemLang development fast, reviewable, and compatible with automated checks.

## 00.01 Test Parallelization

Test files should stay small enough for the test runner to distribute work across files effectively.

- 00.01.001: Lint validation MUST reject test files that contain more than ten individual test definitions.

## 00.02 TypeScript Maintainability

Source functions should stay small enough to review, test, and refactor without hiding decision-heavy control flow.

- 00.02.001: Lint validation MUST enforce a maximum cyclomatic complexity for TypeScript and JavaScript functions.

## 00.03 Worktree Dependency Setup

Repository hooks should keep local npm dependencies present in linked worktrees without requiring a manual install after ordinary Git operations.

- 00.03.001: Checkout and merge hooks MUST run an idempotent npm dependency setup check so worktrees with missing or stale dependencies are repaired even when lockfiles did not change between refs.

## 00.04 Repo-Local Codex Skills

Maintainer workflow skills for working on this repository should be separate from the skills distributed to SemLang plugin consumers.

- 00.04.001: Repo-local maintainer workflow skills MUST live under `.agents/skills` so Codex discovers them as project skills and MUST NOT be shipped from the root plugin `skills` directory.
- 00.04.002: The repo-local `pull-and-review` skill MUST document the Copilot review iteration loop, including resolving only addressed threads, re-requesting review after fixes are pushed, and waiting before deciding the pull request is clean.
