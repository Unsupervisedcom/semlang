import { parseMetadataLiteral } from "./schema-metadata.js";
import type { Diagnostic, IdentityField, FieldDecl, ResolvedConcept, SemanticModel, TypeDecl } from "./types.js";

type TypedMember = IdentityField | FieldDecl;

export function lintSemanticModel(model: SemanticModel): Diagnostic[] {
  return [
    ...lintRequiredTemporalAxes(model),
    ...lintJoinCandidates(model),
    ...lintFieldTypeNameMatches(model),
    ...lintSemanticTypeConsistency(model)
  ];
}

function lintRequiredTemporalAxes(model: SemanticModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const concept of model.concepts.values()) {
    const requiredAxis = concept.stereotype === "event"
      ? "occurrence_time"
      : concept.stereotype === "situation"
        ? "observation_time"
        : undefined;
    if (!requiredAxis || concept.temporal.some((axis) => axis.axis === requiredAxis)) continue;
    const article = concept.stereotype === "event" ? "an" : "a";
    diagnostics.push({
      severity: "error",
      code: "MISSING_TEMPORAL_AXIS",
      message: `Concept ${concept.name} is ${article} ${concept.stereotype} but does not declare ${requiredAxis}.`,
      location: concept.location
    });
  }
  return diagnostics;
}

function lintJoinCandidates(model: SemanticModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const concept of model.concepts.values()) {
    for (const member of typedMembers(concept)) {
      const targetName = identifiesConcept(model.types.get(member.typeName));
      if (!targetName || targetName === concept.name || !model.concepts.has(targetName)) continue;
      if (hasJoinForCandidate(concept, targetName, member.name)) continue;
      diagnostics.push({
        severity: "warning",
        code: "MISSING_JOIN_CANDIDATE",
        message: `Field ${concept.name}.${member.name} has semantic type ${member.typeName}, which identifies ${targetName}; consider declaring an optional join to ${targetName}.`,
        location: member.location
      });
    }
  }
  return diagnostics;
}

function lintSemanticTypeConsistency(model: SemanticModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byFieldName = new Map<string, { concept: ResolvedConcept; member: TypedMember }[]>();
  for (const concept of model.concepts.values()) {
    for (const member of typedMembers(concept)) {
      if (!isLikelyBusinessIdentifier(member.name)) continue;
      const bucket = byFieldName.get(member.name) ?? [];
      bucket.push({ concept, member });
      byFieldName.set(member.name, bucket);
    }
  }

  for (const [name, references] of byFieldName) {
    const typeNames = unique(references.map((reference) => reference.member.typeName));
    if (typeNames.length <= 1) continue;
    if (!typeNames.some((typeName) => isSemanticType(model, typeName))) continue;
    const concepts = references.map((reference) => `${reference.concept.name}.${reference.member.name} :: ${reference.member.typeName}`);
    for (const reference of references) {
      diagnostics.push({
        severity: "warning",
        code: "INCONSISTENT_SEMANTIC_TYPE",
        message: `Field name ${name} uses inconsistent semantic types across concepts: ${concepts.join(", ")}.`,
        location: reference.member.location
      });
    }
  }
  return diagnostics;
}

function lintFieldTypeNameMatches(model: SemanticModel): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const typesByNormalizedName = new Map<string, TypeDecl[]>();
  for (const type of model.types.values()) {
    const key = normalizeName(type.name);
    const bucket = typesByNormalizedName.get(key) ?? [];
    bucket.push(type);
    typesByNormalizedName.set(key, bucket);
  }

  for (const concept of model.concepts.values()) {
    for (const member of typedMembers(concept)) {
      const candidates = typesByNormalizedName.get(normalizeName(member.name)) ?? [];
      const matchingType = candidates.find((type) => type.name !== member.typeName);
      if (!matchingType) continue;
      diagnostics.push({
        severity: "warning",
        code: "FIELD_TYPE_NAME_MISMATCH",
        message: `Field ${concept.name}.${member.name} is typed as ${member.typeName}, but its name matches semantic type ${matchingType.name}.`,
        location: member.location
      });
    }
  }
  return diagnostics;
}

function typedMembers(concept: ResolvedConcept): TypedMember[] {
  return [...concept.identities, ...concept.fields];
}

function identifiesConcept(type: TypeDecl | undefined): string | undefined {
  const entry = type?.metadata.find((item) => item.key === "identifies");
  if (!entry) return undefined;
  const parsed = parseMetadataLiteral(entry.value);
  return typeof parsed === "string" ? parsed : undefined;
}

function hasJoinForCandidate(concept: ResolvedConcept, targetName: string, fieldName: string): boolean {
  return concept.joins.some((join) => {
    if (join.target !== targetName) return false;
    if (join.with === fieldName) return true;
    return Boolean(join.on && new RegExp(`\\b${escapeRegExp(fieldName)}\\b`).test(join.on));
  });
}

function isLikelyBusinessIdentifier(name: string): boolean {
  return /(?:^id$|_id$|Id$|ID$)/.test(name);
}

function isSemanticType(model: SemanticModel, typeName: string): boolean {
  const type = model.types.get(typeName);
  return Boolean(type && typeName !== type.base);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeName(name: string): string {
  return name.replace(/_/g, "").toLowerCase();
}
