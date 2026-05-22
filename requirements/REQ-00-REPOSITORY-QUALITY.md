# REQ-00-REPOSITORY-QUALITY: Repository Quality Gates

The key words "MUST", "MUST NOT", "REQUIRED", "SHOULD", "SHOULD NOT", and "MAY" in this document are to be interpreted as described in RFC 2119.

## Scope

These requirements govern repository-level validation rules that keep SemLang development fast, reviewable, and compatible with automated checks.

## 00.01 Test Parallelization

Test files should stay small enough for the test runner to distribute work across files effectively.

- 00.01.001: Lint validation MUST reject test files that contain more than ten individual test definitions.
