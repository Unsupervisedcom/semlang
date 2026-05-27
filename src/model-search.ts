/*
 * Purpose: Builds lightweight searchable text and scores semantic model items for MCP search and query root inference.
 * Encapsulation: Keep model text extraction and simple token scoring here; tool response shaping belongs with MCP handlers.
 */

import { qualifiedRoleName } from "./roles.js";
import type { ActionDecl, LensDecl, QueryBodyDecl, ResolvedConcept, SemanticModel } from "./types.js";

export function conceptSearchItems(model: SemanticModel) {
  return [...model.concepts.values()].map((concept) => ({
    name: concept.name,
    description: concept.description ?? null,
    stereotype: concept.stereotype,
    text: [
      concept.name,
      concept.description ?? "",
      concept.stereotype,
      concept.source.expression,
      concept.where.map((item) => item.expression).join(" "),
      memberSearchItems(concept)
        .map((item) => `${item.name} ${item.text}`)
        .join(" "),
    ].join(" "),
  }));
}

export function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9_]+/g) ?? [])].filter((token) => token.length > 1);
}

export function scored<T extends { text: string }>(
  items: T[],
  tokens: string[],
  limit: number,
): Array<Omit<T, "text"> & { score: number; matchedTerms: string[] }> {
  return items
    .map((item) => {
      const haystack = item.text.toLowerCase();
      const matchedTerms = tokens.filter((token) => haystack.includes(token));
      const name = "name" in item && typeof item.name === "string" ? item.name.toLowerCase() : "";
      const score = matchedTerms.reduce((sum, token) => sum + (name.includes(token) ? 3 : 1), 0);
      const { text: _text, ...rest } = item;
      return { ...rest, score, matchedTerms };
    })
    .filter((item) => item.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function memberSearchItems(concept: ResolvedConcept) {
  return [
    ...concept.identities.map((value) => ({
      kind: "identity",
      name: value.name,
      text: `${value.description ?? ""} ${value.typeName}`,
      value,
    })),
    ...concept.fields.map((value) => ({
      kind: "field",
      name: value.name,
      text: `${value.description ?? ""} ${value.typeName}`,
      value,
    })),
    ...concept.joins.map((value) => ({
      kind: "join",
      name: value.name,
      text: `${value.target} ${value.on} ${value.at ?? ""}`,
      value,
    })),
    ...concept.roles.map((value) => ({
      kind: "role",
      name: value.name,
      text: `${qualifiedRoleName(concept.name, value.name)} ${value.label ?? ""} ${value.aliases.join(" ")} ${value.predicate}`,
      value: {
        ...value,
        qualifiedName: qualifiedRoleName(concept.name, value.name),
        label: value.label ?? null,
        aliases: value.aliases,
      },
    })),
    ...concept.dimensions.map((value) => ({
      kind: "dimension",
      name: value.name,
      text: `${value.description ?? ""} ${value.expression}`,
      value,
    })),
    ...concept.measures.map((value) => ({
      kind: "measure",
      name: value.name,
      text: `${value.description ?? ""} ${value.expression}`,
      value,
    })),
    ...concept.validations.map((value) => ({
      kind: "validation",
      name: value.name,
      text: `${value.description ?? ""} ${value.predicate ?? ""}`,
      value,
    })),
    ...concept.temporal.map((value) => ({ kind: "temporal_axis", name: value.axis, text: value.expression, value })),
    ...concept.views.map((value) => ({ kind: "view", name: value.name, text: queryBodySearchText(value.body), value })),
    ...concept.actions.map((value) => ({ kind: "action", name: value.name, text: actionSearchText(value), value })),
  ];
}

export function conceptMembersSearchText(members: ResolvedConcept | LensDecl["refinements"][number]["members"]) {
  return [
    members.identities.map((item) => `${item.name} ${item.description ?? ""} ${item.typeName}`).join(" "),
    members.fields.map((item) => `${item.name} ${item.description ?? ""} ${item.typeName}`).join(" "),
    members.joins.map((item) => `${item.name} ${item.target} ${item.on} ${item.at ?? ""}`).join(" "),
    members.roles
      .map(
        (item) =>
          `${item.name} ${"sourceName" in members ? qualifiedRoleName(members.name, item.name) : ""} ${item.label ?? ""} ${item.aliases.join(" ")} ${item.predicate}`,
      )
      .join(" "),
    members.dimensions.map((item) => `${item.name} ${item.description ?? ""} ${item.expression}`).join(" "),
    members.measures.map((item) => `${item.name} ${item.description ?? ""} ${item.expression}`).join(" "),
    members.validations.map((item) => `${item.name} ${item.description ?? ""} ${item.predicate ?? ""}`).join(" "),
    members.temporal.map((item) => `${item.axis} ${item.expression}`).join(" "),
    members.where.map((item) => item.expression).join(" "),
    members.views.map((item) => `${item.name} ${queryBodySearchText(item.body)}`).join(" "),
    members.actions.map(actionSearchText).join(" "),
  ].join(" ");
}

export function actionSearchText(action: ActionDecl): string {
  return [
    action.name,
    action.description ?? "",
    action.subject?.mode ?? "",
    action.params.map((param) => `${param.name} ${param.typeName} ${param.defaultExpression ?? ""}`).join(" "),
    action.guards.map((guard) => `${guard.predicate} ${guard.elseMessage ?? ""}`).join(" "),
    action.edits
      .map((edit) =>
        edit.kind === "set"
          ? `${edit.target} ${edit.expression}`
          : edit.kind === "insert"
            ? edit.assignments.map((assignment) => `${assignment.target} ${assignment.expression}`).join(" ")
            : "delete",
      )
      .join(" "),
    action.logBlocks.flatMap((block) => block.lines).join(" "),
    action.effectBlocks.flatMap((block) => block.lines).join(" "),
    action.agentMetadata.map((entry) => `${entry.key} ${entry.value}`).join(" "),
  ].join(" ");
}

export function queryBodySearchText(body: QueryBodyDecl): string {
  return [
    body.where?.expression ?? "",
    body.select.map(queryItemText).join(" "),
    body.groupBy.map(queryItemText).join(" "),
    body.aggregate.map(queryItemText).join(" "),
    body.calculate.map(queryItemText).join(" "),
    body.orderBy.map(queryItemText).join(" "),
  ].join(" ");
}

function queryItemText(item: { expression: string; alias?: string }) {
  return `${item.alias ?? ""} ${item.expression}`;
}
