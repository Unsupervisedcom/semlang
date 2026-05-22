/*
 * Purpose: Provides local ESLint rules that protect SemLang repository test ergonomics.
 * Encapsulation: Keep repository-specific lint policy here; ESLint config wires the policy into file groups.
 */

const testFunctionNames = new Set(["it", "test"]);

function rootIdentifierName(node) {
  if (!node) return undefined;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression") return rootIdentifierName(node.object);
  if (node.type === "CallExpression") return rootIdentifierName(node.callee);
  return undefined;
}

export default {
  meta: {
    type: "suggestion",
    docs: {
      description: "limit the number of individual tests in one test file",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          max: {
            type: "integer",
            minimum: 1,
          },
        },
      },
    ],
    messages: {
      tooManyTests:
        "Test files may contain at most {{max}} individual tests; found {{count}}. Split this file so the test runner can parallelize more work.",
    },
  },
  create(context) {
    const max = context.options[0]?.max ?? 10;
    const testNodes = [];

    return {
      CallExpression(node) {
        if (node.parent?.type === "CallExpression" && node.parent.callee === node) return;
        const name = rootIdentifierName(node.callee);
        if (name && testFunctionNames.has(name)) testNodes.push(node);
      },
      "Program:exit"() {
        if (testNodes.length <= max) return;
        context.report({
          node: testNodes[max],
          messageId: "tooManyTests",
          data: {
            count: String(testNodes.length),
            max: String(max),
          },
        });
      },
    };
  },
};
