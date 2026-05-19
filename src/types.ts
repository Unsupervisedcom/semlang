export type Severity = "error" | "warning";

export interface SourceLocation {
  file?: string;
  line: number;
  column: number;
}

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  location?: SourceLocation;
}

export interface CompileOptions {
  filePath?: string;
  sourceMode?: "bare" | "duckdb";
  packageLoader?: PackageLoader;
}

export interface PackageLoader {
  load(path: string, fromFile?: string): Promise<{ filePath: string; source: string }> | { filePath: string; source: string };
}

export interface ParseResult {
  ast?: OntoqlAst;
  diagnostics: Diagnostic[];
}

export interface ResolveResult {
  model?: SemanticModel;
  diagnostics: Diagnostic[];
}

export interface CompileResult {
  ast?: OntoqlAst;
  model?: SemanticModel;
  malloy?: string;
  diagnostics: Diagnostic[];
}

export interface OntoqlAst {
  kind: "OntoqlAst";
  packageName: string;
  filePath?: string;
  includes: IncludeDecl[];
  types: TypeDecl[];
  concepts: ConceptDecl[];
  lenses: LensDecl[];
  queries: QueryDecl[];
  location?: SourceLocation;
}

export interface IncludeDecl {
  path: string;
  location: SourceLocation;
}

export interface MetadataEntry {
  key: string;
  value: string;
  location: SourceLocation;
}

export interface TypeDecl {
  name: string;
  base: string;
  metadata: MetadataEntry[];
  location: SourceLocation;
}

export type ConceptStereotype = "kind" | "event" | "situation" | "relator" | "phase";

export interface ConceptDecl {
  name: string;
  stereotype: ConceptStereotype;
  phaseParent?: string;
  table: string;
  identities: IdentityField[];
  fields: FieldDecl[];
  joins: JoinDecl[];
  roles: RoleDecl[];
  dimensions: DefinitionDecl[];
  measures: DefinitionDecl[];
  views: ViewDecl[];
  validations: ValidationDecl[];
  temporal: TemporalAxisDecl[];
  where: ExpressionDecl[];
  location: SourceLocation;
}

export interface IdentityField {
  name: string;
  typeName: string;
  nullable: boolean;
  location: SourceLocation;
}

export interface FieldDecl {
  name: string;
  typeName: string;
  nullable: boolean;
  unique: boolean;
  location: SourceLocation;
}

export interface JoinDecl {
  kind: "join_one" | "join_many";
  name: string;
  optional: boolean;
  target: string;
  on: string;
  at?: string;
  location: SourceLocation;
}

export interface RoleDecl {
  name: string;
  predicate: string;
  location: SourceLocation;
}

export interface DefinitionDecl {
  name: string;
  expression: string;
  typeName?: string;
  nullable?: boolean;
  location: SourceLocation;
}

export interface ValidationDecl {
  name: string;
  description?: string;
  predicate?: string;
  location: SourceLocation;
}

export interface TemporalAxisDecl {
  axis: "occurrence_time" | "valid_time" | "observation_time" | "recorded_time";
  expression: string;
  location: SourceLocation;
}

export interface ExpressionDecl {
  expression: string;
  location: SourceLocation;
}

export interface ViewDecl {
  name: string;
  body: QueryBodyDecl;
  location: SourceLocation;
}

export interface QueryBodyDecl {
  where?: ExpressionDecl;
  groupBy: QueryItemDecl[];
  aggregate: QueryItemDecl[];
}

export interface QueryItemDecl {
  expression: string;
  alias?: string;
  location: SourceLocation;
}

export interface LensDecl {
  name: string;
  parents: string[];
  description?: string;
  types: TypeDecl[];
  refinements: RefinementDecl[];
  location: SourceLocation;
}

export interface RefinementDecl {
  conceptName: string;
  members: ConceptMembers;
  location: SourceLocation;
}

export interface ConceptMembers {
  identities: IdentityField[];
  fields: FieldDecl[];
  joins: JoinDecl[];
  roles: RoleDecl[];
  dimensions: DefinitionDecl[];
  measures: DefinitionDecl[];
  views: ViewDecl[];
  validations: ValidationDecl[];
  temporal: TemporalAxisDecl[];
  where: ExpressionDecl[];
}

export interface QueryDecl {
  name: string;
  root: string;
  lenses: string[];
  body: QueryBodyDecl;
  location: SourceLocation;
}

export interface SemanticModel {
  packageName: string;
  files: string[];
  types: Map<string, TypeDecl>;
  concepts: Map<string, ResolvedConcept>;
  lenses: Map<string, LensDecl>;
  queries: QueryDecl[];
}

export interface ResolvedConcept extends ConceptDecl {
  sourceName: string;
  roleBaseNames: Set<string>;
}

export function emptyMembers(): ConceptMembers {
  return {
    identities: [],
    fields: [],
    joins: [],
    roles: [],
    dimensions: [],
    measures: [],
    views: [],
    validations: [],
    temporal: [],
    where: []
  };
}
