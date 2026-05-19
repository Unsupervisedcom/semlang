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
  jsonSchema?: JsonSchemaDocument;
  diagnostics: Diagnostic[];
}

export type JsonSchemaDocument = Record<string, unknown>;

export interface JsonSchemaEmitOptions {
  id?: string;
  title?: string;
  concepts?: string[];
}

export interface JsonSchemaEmitResult {
  schema: JsonSchemaDocument;
  diagnostics: Diagnostic[];
}

export interface OntoqlAst {
  kind: "OntoqlAst";
  packageName: string;
  filePath?: string;
  includes: IncludeDecl[];
  sources: SourceDecl[];
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

export type SourceExpression =
  | {
      kind: "table";
      connection: string;
      path: string;
      expression: string;
      location: SourceLocation;
    }
  | {
      kind: "sql";
      connection: string;
      sql: string;
      expression: string;
      location: SourceLocation;
    }
  | {
      kind: "reference";
      name: string;
      expression: string;
      location: SourceLocation;
    };

export interface SourceDecl {
  name: string;
  source: SourceExpression;
  query?: QueryBodyDecl;
  location: SourceLocation;
}

export interface ConceptDecl {
  name: string;
  description?: string;
  stereotype: ConceptStereotype;
  phaseParent?: string;
  source: SourceExpression;
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
  actions: ActionDecl[];
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
  writeable: boolean;
  writeMappings: WriteMappingDecl[];
  location: SourceLocation;
}

export interface JoinDecl {
  kind: "join_one" | "join_many" | "join_cross";
  name: string;
  optional: boolean;
  target: string;
  on: string;
  with?: string;
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
  writeable: boolean;
  writeMappings: WriteMappingDecl[];
  location: SourceLocation;
}

export type WriteMappingDecl =
  | {
      kind: "default";
      location: SourceLocation;
    }
  | {
      kind: "column";
      column: string;
      expression: string;
      location: SourceLocation;
    }
  | {
      kind: "sql";
      sql: string;
      location: SourceLocation;
    };

export type ActionSubjectMode = "single" | "new" | "collection";

export interface ActionSubjectDecl {
  mode: string;
  metadata: MetadataEntry[];
  location: SourceLocation;
}

export interface ActionParamDecl {
  name: string;
  typeName: string;
  nullable: boolean;
  defaultExpression?: string;
  hidden: boolean;
  location: SourceLocation;
}

export interface ActionGuardDecl {
  predicate: string;
  elseMessage?: string;
  location: SourceLocation;
}

export type ActionEditDecl =
  | {
      kind: "set";
      target: string;
      expression: string;
      location: SourceLocation;
    }
  | {
      kind: "insert";
      assignments: ActionInsertAssignmentDecl[];
      location: SourceLocation;
    };

export interface ActionInsertAssignmentDecl {
  target: string;
  expression: string;
  location: SourceLocation;
}

export interface ActionMetadataBlockDecl {
  kind: "log" | "effect" | "agent";
  header: string;
  entries: MetadataEntry[];
  lines: string[];
  location: SourceLocation;
}

export interface ActionDecl {
  name: string;
  description?: string;
  subject?: ActionSubjectDecl;
  params: ActionParamDecl[];
  guards: ActionGuardDecl[];
  edits: ActionEditDecl[];
  logBlocks: ActionMetadataBlockDecl[];
  effectBlocks: ActionMetadataBlockDecl[];
  agentBlock?: ActionMetadataBlockDecl;
  agentMetadata: MetadataEntry[];
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
  having?: ExpressionDecl;
  select: QueryItemDecl[];
  groupBy: QueryItemDecl[];
  aggregate: QueryItemDecl[];
  calculate: QueryItemDecl[];
  orderBy: QueryItemDecl[];
  nest?: QueryNestDecl[];
  index?: QueryItemDecl[];
  limit?: LimitDecl;
}

export interface QueryItemDecl {
  expression: string;
  alias?: string;
  location: SourceLocation;
}

export interface QueryNestDecl {
  name?: string;
  view?: string;
  body?: QueryBodyDecl;
  location: SourceLocation;
}

export interface LimitDecl {
  value: number;
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
  description?: string;
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
  actions: ActionDecl[];
}

export interface QueryDecl {
  name: string;
  root: string;
  lenses: string[];
  body: QueryBodyDecl;
  view?: string;
  location: SourceLocation;
}

export interface SemanticModel {
  packageName: string;
  files: string[];
  sources: Map<string, SourceDecl>;
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
    description: undefined,
    identities: [],
    fields: [],
    joins: [],
    roles: [],
    dimensions: [],
    measures: [],
    views: [],
    validations: [],
    temporal: [],
    where: [],
    actions: []
  };
}
