/*
 * Purpose: Configures ESLint for SemLang TypeScript and JavaScript source files.
 * Encapsulation: Keep static analysis policy here; formatting policy belongs in Prettier config and runtime behavior belongs in source modules.
 */

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import maxTestsPerFile from "./eslint-rules/max-tests-per-file.js";

const semlangRules = {
  rules: {
    "max-tests-per-file": maxTestsPerFile,
  },
};

export default tseslint.config(
  {
    ignores: [".deepwork/**", "dist/**", "docs-site/.docusaurus/**", "docs-site/build/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: "module",
    },
    rules: {
      // Passes the current codebase; ratchet this toward 20 as complex compiler and MCP flows are split up.
      complexity: ["error", { max: 31 }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["test/**/*.test.ts"],
    plugins: {
      semlang: semlangRules,
    },
    rules: {
      "semlang/max-tests-per-file": ["error", { max: 10 }],
    },
  },
);
