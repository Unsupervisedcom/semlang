import type { ResolvedConcept, RoleDecl, SemanticModel } from "./types.js";

export interface RoleResolution {
  concept: ResolvedConcept;
  role: RoleDecl;
  qualifiedName: string;
}

export interface RoleIndex {
  byName: Map<string, RoleResolution>;
  byQualifiedName: Map<string, RoleResolution>;
  ambiguousShortNames: Set<string>;
}

export function qualifiedRoleName(conceptName: string, roleName: string): string {
  return `${conceptName}.${roleName}`;
}

export function roleBaseNames(conceptName: string, roles: RoleDecl[]): Set<string> {
  return new Set(roles.flatMap((role) => [role.name, qualifiedRoleName(conceptName, role.name)]));
}

export function buildRoleIndex(model: SemanticModel): RoleIndex {
  const byName = new Map<string, RoleResolution>();
  const byQualifiedName = new Map<string, RoleResolution>();
  const ambiguousShortNames = new Set<string>();

  for (const concept of model.concepts.values()) {
    for (const role of concept.roles) {
      const qualifiedName = qualifiedRoleName(concept.name, role.name);
      const resolution = { concept, role, qualifiedName };
      byQualifiedName.set(qualifiedName, resolution);

      const existing = byName.get(role.name);
      if (existing && existing.concept.name !== concept.name) {
        byName.delete(role.name);
        ambiguousShortNames.add(role.name);
      } else if (!ambiguousShortNames.has(role.name)) {
        byName.set(role.name, resolution);
      }
    }
  }

  return { byName, byQualifiedName, ambiguousShortNames };
}

export function findRoleOnConcept(concept: ResolvedConcept | undefined, roleName: string): RoleResolution | undefined {
  if (!concept) return undefined;
  const role = concept.roles.find((candidate) => candidate.name === roleName);
  return role ? { concept, role, qualifiedName: qualifiedRoleName(concept.name, role.name) } : undefined;
}
