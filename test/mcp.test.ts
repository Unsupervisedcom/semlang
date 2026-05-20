// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../src/index.js";

const root = path.resolve(import.meta.dirname, "..");

async function tempExamplePath(domain: string, fileName = "example.semlang"): Promise<string> {
  const sourceDir = path.join(root, "examples", domain);
  const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), `semlang-mcp-${domain}-`));
  for (const name of ["example.semlang", "example_with_lens.semlang", "schema.sql", "sample_data.sql"]) {
    const source = path.join(sourceDir, name);
    try {
      await fs.copyFile(source, path.join(targetDir, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return path.join(targetDir, fileName);
}

function asObject(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

function records(value: unknown): Record<string, unknown>[] {
  return asArray(value).map(asObject);
}

function names(value: unknown): string[] {
  return asArray(value).map((item) => typeof item === "string" ? item : String(asObject(item).name));
}

function text(value: unknown): string {
  expect(typeof value).toBe("string");
  return value as string;
}

function expectOk(value: Record<string, unknown>): void {
  expect(value.ok).toBe(true);
  expect(value.diagnostics ?? []).toEqual([]);
}

function expectQuery(value: Record<string, unknown>, name: string, rootName: string): Record<string, unknown> {
  expectOk(value);
  const query = asObject(value.query);
  expect(query).toMatchObject({ name, root: rootName });
  return query;
}

function pathResult(response: Record<string, unknown>, target: string): Record<string, unknown> {
  const result = records(response.results).find((candidate) => candidate.target === target);
  expect(result).toBeDefined();
  expect(records(result?.paths).length).toBeGreaterThan(0);
  return result!;
}

function rowWith(rows: unknown, expected: Record<string, unknown>): Record<string, unknown> {
  const row = records(rows).find((candidate) =>
    Object.entries(expected).every(([key, value]) => candidate[key] === value)
  );
  expect(row).toBeDefined();
  return row!;
}

describe("SemLang MCP example narratives", () => {
  it("surfaces ignored sources in context and semantic search", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      source: `
package mcp.ignored_sources

ignored duckdb.table('legacy_ticket_log') {
  reason: "Deprecated -- replaced by event_transactions as of 2025-Q3"
}

concept EventTransaction is event from duckdb.table('event_transactions') {
  identity event_id :: string
}
`
    });
    expectOk(source);
    const context = asObject(source.context);
    expect(records(context.ignored)[0]).toMatchObject({
      source: "duckdb.table('legacy_ticket_log')",
      sourceKind: "table",
      reason: "\"Deprecated -- replaced by event_transactions as of 2025-Q3\""
    });

    const search = await mcp.tools.semantic_search_terms({ question: "legacy ticket log deprecated" });
    expectOk(search);
    expect(records(search.ignored)[0]).toMatchObject({
      source: "duckdb.table('legacy_ticket_log')",
      reason: "\"Deprecated -- replaced by event_transactions as of 2025-Q3\""
    });
  });

  it("surfaces role qualified names, labels, and aliases in ontology search tools", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      source: `
package mcp.role_aliases

concept Customer is kind from duckdb.table('customers') {
  identity customer_id :: string
  field:
    status :: string
  role Active when status = 'active' {
    label: "Active Customer"
    aliases: "Current Customer", "Open Customer"
  }
}
`
    });
    expectOk(source);

    const role = await mcp.tools.ontology_describe_role({ role: "Customer.Active" });
    expectOk(role);
    expect(records(role.roles)[0]).toMatchObject({
      concept: "Customer",
      name: "Active",
      qualifiedName: "Customer.Active",
      label: "Active Customer",
      aliases: ["Current Customer", "Open Customer"],
      predicate: "status = 'active'"
    });

    const search = await mcp.tools.semantic_search_terms({ question: "current customer" });
    expectOk(search);
    const roleMatch = records(search.members).find((member) => member.kind === "role");
    expect(roleMatch).toMatchObject({
      name: "Active",
      concept: "Customer",
      matchedTerms: expect.arrayContaining(["current", "customer"])
    });

    const entity = await mcp.tools.catalog_resolve_entity({ name: "Open Customer" });
    expectOk(entity);
    expect(records(entity.matches).find((match) => match.kind === "role")).toMatchObject({
      name: "Active",
      concept: "Customer"
    });
  });

  it("walks the retail base ontology from search to generated Malloy", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("retail-omnichannel-margin-and-returns")
    });
    expectOk(source);
    const context = asObject(source.context);
    expect(names(context.concepts)).toEqual(expect.arrayContaining(["SaleLine", "Store", "ProductSKU", "ReturnLine"]));
    expect(names(context.queries)).toContain("monthly_margin_and_returns");

    // The agent starts from the business phrase and checks which concepts,
    // metrics, and named queries the ontology thinks are relevant.
    const search = await mcp.tools.semantic_search_terms({
      question: "monthly margin and returns by region and product category"
    });
    expectOk(search);
    const conceptMatches = records(search.concepts);
    expect(conceptMatches.map((concept) => concept.name)).toEqual(expect.arrayContaining(["SaleLine", "Store", "ReturnLine"]));
    expect(conceptMatches.find((concept) => concept.name === "SaleLine")).toMatchObject({
      description: expect.stringContaining("Sold SKU line fact grain")
    });
    expect(names(search.metrics)).toEqual(expect.arrayContaining(["merchandising_margin", "settled_refund_amount"]));
    expect(names(search.queries)).toContain("monthly_margin_and_returns");

    // The query groups by store and product while aggregating return measures,
    // so the agent asks for all required paths in one array-valued call.
    const paths = await mcp.tools.ontology_find_paths({
      from: "SaleLine",
      to: ["Store", "ProductSKU", "ReturnLine"]
    });
    expectOk(paths);
    expect(paths).not.toHaveProperty("targets");
    expect(records(pathResult(paths, "Store").paths)[0]?.concepts).toEqual(["SaleLine", "Sale", "Store"]);
    expect(records(pathResult(paths, "ProductSKU").paths)[0]?.concepts).toEqual(["SaleLine", "ProductSKU"]);
    expect(records(pathResult(paths, "ReturnLine").paths)[0]?.concepts).toEqual(["SaleLine", "ReturnLine"]);

    // The named query already encodes the selected root, groupings, and
    // measures, so validation should confirm the query without returning Malloy.
    const validated = await mcp.tools.query_validate({ query: "monthly_margin_and_returns" });
    const validatedQuery = expectQuery(validated, "monthly_margin_and_returns", "SaleLine");
    expect(validatedQuery.lenses).toEqual([]);

    // After validation, query.run should generate Malloy and execute against
    // the example DuckDB schema and sample data.
    const run = await mcp.tools.query_run({ query: "monthly_margin_and_returns" });
    expectQuery(run, "monthly_margin_and_returns", "SaleLine");
    expect(text(run.malloy)).toContain("source: retail_line_items is duckdb.table('retail_line_items') extend");
    expect(text(run.queryMalloy)).toContain("query: monthly_margin_and_returns is retail_line_items ->");
    expect(text(run.queryMalloy)).toContain("merchandising_margin");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true, engine: "duckdb" });
    expect(records(execution.rows)).toHaveLength(7);
    expect(rowWith(execution.rows, {
      sold_month: "2025-01-01 00:00:00",
      region: "Mountain",
      category_name: "Performance Footwear"
    })).toMatchObject({
      net_sales: "112.50",
      merchandising_margin: "36.50",
      settled_refund_amount: "112.50",
      net_after_settled_refunds: "0.00",
      settled_return_rate: 1
    });

    // 06.01.004 / 06.10.003: Action-aware agents should see available actions
    // in concept details before invoking a write against the temp-mounted data.
    const returnConcept = await mcp.tools.ontology_describe_concept({ concept: "ReturnLine" });
    expectOk(returnConcept);
    expect(names(asObject(returnConcept.concept).actions)).toContain("settle_return");

    const settleAction = await mcp.tools.ontology_describe_action({ action: "settle_return" });
    expectOk(settleAction);
    expect(asObject(settleAction.action)).toMatchObject({
      concept: "ReturnLine",
      name: "settle_return",
      subject: { mode: "single" }
    });

    const settled = await mcp.tools.action_invoke({
      action: "settle_return",
      subject: { return_line_id: "RET_50002_1" },
      params: {
        approved_refund_amount: 121.25,
        approved_restocking_fee_amount: 4.5
      }
    });
    expect(settled).toMatchObject({
      ok: true,
      engine: "duckdb",
      action: "settle_return",
      concept: "ReturnLine",
      changedRowCount: 1
    });
    expect(text(settled.sql)).toContain("UPDATE \"return_lines\" AS root");
    expect(records(settled.rows)[0]).toMatchObject({
      return_line_id: "RET_50002_1",
      return_status: "settled",
      refund_amount: "121.25",
      restocking_fee_amount: "4.50"
    });

    // The second query observes the same MCP DuckDB session after mutation,
    // proving query.run no longer rebuilds a fresh in-memory database per call.
    const rerun = await mcp.tools.query_run({ query: "monthly_margin_and_returns" });
    expectQuery(rerun, "monthly_margin_and_returns", "SaleLine");
    const rerunExecution = asObject(rerun.execution);
    expect(rowWith(rerunExecution.rows, {
      sold_month: "2025-02-01 00:00:00",
      region: "Digital",
      category_name: "Performance Footwear"
    })).toMatchObject({
      settled_refund_amount: "121.25",
      net_after_settled_refunds: "148.75"
    });
  });

  it("resolves a retail business entity and runs the customer-count query against DuckDB", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("retail-omnichannel-margin-and-returns")
    });
    expectOk(source);

    // If a user supplies a business label like "Denver", the agent first asks
    // for ontology-backed candidate fields before applying a concrete filter.
    const entity = await mcp.tools.catalog_resolve_entity({ concept: "Store", business_name: "Denver" });
    expectOk(entity);
    expect(entity).toMatchObject({ concept: "Store", business_name: "Denver" });
    const storeCandidate = records(entity.candidates)[0];
    expect(names(storeCandidate?.candidateFields)).toEqual(expect.arrayContaining(["store_name", "region", "store_label"]));
    expect(records(storeCandidate?.rows)[0]).toMatchObject({
      store_code: "DEN-01",
      store_name: "Denver Cherry Creek"
    });

    // The example query encodes the resulting store filter; running it should
    // use DuckDB and return real rows, even when the sampled date has no sales.
    const run = await mcp.tools.query_run({ query: "denver_store_customer_count_on_2025_09_15" });
    expectQuery(run, "denver_store_customer_count_on_2025_09_15", "Sale");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true, engine: "duckdb" });
    expect(records(execution.rows)[0]).toMatchObject({
      sales: 0,
      identified_customer_sales: 0,
      identified_customers: 0,
      unrecognized_cash_sales: 0
    });
  });

  it("walks the retail lens ontology through suggestion, PII requirements, and lens-local Malloy", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("retail-omnichannel-margin-and-returns", "example_with_lens.semlang")
    });
    expectOk(source);
    const context = asObject(source.context);
    expect(names(context.lenses)).toEqual(expect.arrayContaining(["western_margin_operations", "with_pii"]));

    // The agent has a role/context phrase, so it asks which lens overlays match
    // before choosing a governed query surface.
    const suggested = await mcp.tools.lens_suggest({
      user_context: "western margin returns intervention with customer contact"
    });
    expectOk(suggested);
    expect(names(suggested.lenses)).toEqual(expect.arrayContaining([
      "western_margin_operations",
      "margin_operations",
      "with_pii"
    ]));

    // The top suggested lens is composed, so the agent inspects its parents and
    // direct refinements before expanding the model.
    const described = await mcp.tools.lens_describe({ lens: "western_margin_operations" });
    expectOk(described);
    const describedLens = asObject(described.lens);
    expect(describedLens.parents).toEqual(["western_region", "margin_operations"]);
    expect(records(describedLens.refinements)[0]).toMatchObject({
      lens: "western_margin_operations",
      concept: "SaleLine",
      views: ["western_margin_risk_by_category"]
    });

    // Expansion checks that parent lenses are applied and margin operations add
    // the temporary risk-band type the query needs.
    const expanded = await mcp.tools.lens_expand({
      lens: "western_margin_operations",
      concept: "SaleLine"
    });
    expectOk(expanded);
    expect(names(asObject(expanded.model).types)).toContain("MarginRiskBand");
    expect(records(expanded.refinements)[0]).toMatchObject({
      lens: "western_margin_operations",
      concept: "SaleLine"
    });

    // Before producing a customer-service queue, the agent asks which lens owns
    // contact/PII fields rather than assuming they exist in the base ontology.
    const piiFields = await mcp.tools.lens_required_fields({
      fields: ["contact_email", "phone_number", "customer_contact_email"]
    });
    expectOk(piiFields);
    expect(piiFields.requestedFields).toEqual(["contact_email", "phone_number", "customer_contact_email"]);
    const piiMatches = records(piiFields.matches);
    const customerPii = piiMatches.find((match) => match.lens === "with_pii" && match.concept === "Customer");
    expect(customerPii).toBeDefined();
    expect(records(customerPii?.matches)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        field: "contact_email",
        exposedAs: [expect.objectContaining({ field: "contact_email", kind: "dimension", expression: "email_address" })]
      }),
      expect.objectContaining({
        field: "phone_number",
        exposedAs: [expect.objectContaining({ field: "phone_number", kind: "field", typeName: "string" })],
        requiredByExpressions: ["phone_number"]
      })
    ]));
    const salePii = piiMatches.find((match) => match.lens === "with_pii" && match.concept === "Sale");
    expect(records(salePii?.matches)).toContainEqual(expect.objectContaining({
      field: "customer_contact_email",
      exposedAs: [expect.objectContaining({ field: "customer_contact_email", expression: "customer.contact_email" })]
    }));

    // The lens queries should validate as named examples because their roots and
    // lens lists are declared in the fixture.
    const interventionValidated = await mcp.tools.query_validate({ query: "western_margin_intervention_queue" });
    const interventionQuery = expectQuery(interventionValidated, "western_margin_intervention_queue", "SaleLine");
    expect(interventionQuery.lenses).toEqual(["western_margin_operations"]);

    const piiValidated = await mcp.tools.query_validate({ query: "pii_customer_service_returns" });
    const piiQuery = expectQuery(piiValidated, "pii_customer_service_returns", "ReturnLine");
    expect(piiQuery.lenses).toEqual(["with_pii"]);

    // Running a lens query should still produce lens-local Malloy; DuckDB
    // execution is skipped until lens-expanded SQL lowering exists.
    const run = await mcp.tools.query_run({ query: "western_margin_intervention_queue" });
    expectQuery(run, "western_margin_intervention_queue", "SaleLine");
    expect(text(run.malloy)).toContain("source: retail_line_items__western_margin_intervention_queue is duckdb.table('retail_line_items') extend");
    expect(text(run.malloy)).toContain("margin_risk_band is");
    expect(text(run.queryMalloy)).toContain("query: western_margin_intervention_queue is retail_line_items__western_margin_intervention_queue ->");
    expect(asObject(run.execution)).toMatchObject({
      ok: false,
      skipped: true,
      reason: "DuckDB execution for lens-expanded queries is not implemented yet."
    });
  });

  it("uses SaaS source, search, metric explanation, array paths, and validation", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("saas-product-usage-and-revenue")
    });
    expectOk(source);
    expect(names(asObject(source.context).concepts)).toEqual(expect.arrayContaining([
      "SubscriptionPeriod",
      "RevenueRecognitionEntry",
      "FeatureUsageDay"
    ]));

    // The SaaS fixture warns that ARR, recognized revenue, and usage have
    // distinct grains, so search should surface multiple candidate roots.
    const search = await mcp.tools.semantic_search_terms({
      question: "recognized revenue ARR movement subscription product usage"
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(expect.arrayContaining([
      "SubscriptionPeriod",
      "RevenueRecognitionEntry",
      "FeatureUsageDay"
    ]));

    // Since "recognized revenue" is an accounting measure, the agent asks the
    // ontology to explain the metric rather than treating invoice total as ARR.
    const metric = await mcp.tools.ontology_explain_metric({ metric: "recognized_revenue" });
    expectOk(metric);
    expect(records(metric.metrics)[0]).toMatchObject({
      concept: "RevenueRecognitionEntry",
      name: "recognized_revenue",
      expression: "sum(recognized_revenue_amount)"
    });

    // For entitlement-aware usage, the agent needs feature, entitlement, and
    // plan context from the FeatureUsageDay root in one array request.
    const paths = await mcp.tools.ontology_find_paths({
      from: "FeatureUsageDay",
      to: ["ProductFeature", "EntitlementInterval", "ProductPlan"]
    });
    expectOk(paths);
    expect(paths).not.toHaveProperty("targets");
    expect(records(pathResult(paths, "ProductFeature").paths)[0]?.concepts).toEqual([
      "FeatureUsageDay",
      "ProductFeature"
    ]);
    expect(records(pathResult(paths, "EntitlementInterval").paths)[0]?.concepts).toEqual([
      "FeatureUsageDay",
      "EntitlementInterval"
    ]);
    expect(records(pathResult(paths, "ProductPlan").paths)[0]?.concepts).toEqual([
      "FeatureUsageDay",
      "ProductPlan"
    ]);

    // With those joins confirmed, the named usage query should validate at the
    // FeatureUsageDay grain.
    const validated = await mcp.tools.query_validate({ query: "entitlement_aware_usage" });
    expectQuery(validated, "entitlement_aware_usage", "FeatureUsageDay");

    // 06.07.004 / 06.10.003: subject:new actions should describe their insert
    // mappings and create rows in the temp-mounted DuckDB database.
    const supportConcept = await mcp.tools.ontology_describe_concept({ concept: "SupportCase" });
    expectOk(supportConcept);
    expect(names(asObject(supportConcept.concept).actions)).toContain("open_case");

    const openCaseAction = await mcp.tools.ontology_describe_action({
      concept: "SupportCase",
      name: "open_case"
    });
    expectOk(openCaseAction);
    expect(asObject(openCaseAction.action)).toMatchObject({
      concept: "SupportCase",
      name: "open_case",
      subject: { mode: "new" }
    });

    const opened = await mcp.tools.action_invoke({
      concept: "SupportCase",
      action: "open_case",
      subject: { support_case_id: "CASE_MCP_OPEN_1" },
      params: {
        account_id: "ACCT_ACME",
        workspace_id: "WS_ACME_PROD",
        subscription_id: "SUB_ACME_MAIN",
        priority: "urgent",
        channel: "chat",
        category: "workflow_error"
      }
    });
    expect(opened).toMatchObject({
      ok: true,
      engine: "duckdb",
      action: "open_case",
      concept: "SupportCase",
      changedRowCount: 1
    });
    expect(text(opened.sql)).toContain("INSERT INTO \"support_cases\"");
    expect(records(opened.rows)[0]).toMatchObject({
      support_case_id: "CASE_MCP_OPEN_1",
      account_id: "ACCT_ACME",
      priority: "urgent",
      case_status: "open",
      channel: "chat",
      category: "workflow_error",
      sla_paused_minutes: 0
    });
  });

  it("uses banking source, search, lens planning, and regulatory watchlist validation", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("banking-credit-risk-and-customer-exposure", "example_with_lens.semlang")
    });
    expectOk(source);
    expect(names(asObject(source.context).lenses)).toEqual(expect.arrayContaining([
      "regulatory_base_reporting",
      "commercial_real_estate_concentration",
      "watchlist_credit_review"
    ]));

    // The banking question mixes regulatory scope, CRE concentration, and
    // officer action, so search should identify the exposure root and risk paths.
    const search = await mcp.tools.semantic_search_terms({
      question: "regulatory CRE watchlist exposure after guarantee collateral"
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(expect.arrayContaining([
      "LoanExposureSnapshot",
      "Guarantee",
      "LoanCollateralLink"
    ]));

    // The comment in the fixture points to lens.plan for composing the
    // regulatory, CRE, and watchlist overlays before validating the queue.
    const plan = await mcp.tools.lens_plan({
      question: "regulatory CRE watchlist queue",
      lenses: ["regulatory_base_reporting", "commercial_real_estate_concentration", "watchlist_credit_review"]
    });
    expectOk(plan);
    expect(names(plan.lenses)).toEqual([
      "regulatory_base_reporting",
      "commercial_real_estate_concentration",
      "watchlist_credit_review"
    ]);
    expect(records(plan.steps).map((step) => step.lens)).toEqual([
      "regulatory_base_reporting",
      "commercial_real_estate_concentration",
      "watchlist_credit_review"
    ]);

    // Once the lens stack is known, the composed named query should validate on
    // LoanExposureSnapshot with the regulatory_cre_watchlist lens applied.
    const validated = await mcp.tools.query_validate({ query: "cre_regulatory_watchlist_queue" });
    const query = expectQuery(validated, "cre_regulatory_watchlist_queue", "LoanExposureSnapshot");
    expect(query.lenses).toEqual(["regulatory_cre_watchlist"]);
  });

  it("uses healthcare source, search, temporal axes, paths, and discharge audit validation", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("healthcare-patient-journey-and-quality-measures")
    });
    expectOk(source);
    expect(names(asObject(source.context).concepts)).toEqual(expect.arrayContaining([
      "InpatientStay",
      "DiagnosisInterval",
      "QualityMeasurePopulation"
    ]));

    // The healthcare question asks about diagnoses active at discharge, so
    // search should keep the discharge denominator root and diagnosis interval.
    const search = await mcp.tools.semantic_search_terms({
      question: "readmission denominator diagnosis active at discharge"
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(expect.arrayContaining(["InpatientStay", "DiagnosisInterval"]));

    // Active-at-discharge language is temporal, so the agent inspects the valid
    // time axes before asking for the join path.
    const axes = await mcp.tools.ontology_describe_temporal_axes({ concept: "DiagnosisInterval" });
    expectOk(axes);
    expect(records(axes.axes).map((axis) => axis.axis)).toEqual(["valid_time", "recorded_time"]);
    expect(records(axes.axes)[0]?.expression).toBe("period(clinical_valid_start, clinical_valid_end)");

    // The path should make the discharge-date temporal join explicit.
    const paths = await mcp.tools.ontology_find_paths({
      from: "InpatientStay",
      to: "DiagnosisInterval"
    });
    expectOk(paths);
    const dischargePath = records(pathResult(paths, "DiagnosisInterval").paths)[0];
    expect(dischargePath.concepts).toEqual(["InpatientStay", "DiagnosisInterval"]);
    expect(records(dischargePath.steps)[0]).toMatchObject({
      join: "diagnoses_at_discharge",
      kind: "join_many",
      at: "discharge_date"
    });

    // With the temporal path established, the denominator audit query should
    // validate without changing the inpatient stay grain.
    const validated = await mcp.tools.query_validate({ query: "discharge_diagnosis_denominator_audit" });
    expectQuery(validated, "discharge_diagnosis_denominator_audit", "InpatientStay");
  });

  it("uses manufacturing source, search, concept description, array paths, and supplier quality validation", async () => {
    const mcp = createSemLangMcp();

    const source = await mcp.tools.set_ontology_source({
      path: await tempExamplePath("manufacturing-supply-chain-traceability-and-quality")
    });
    expectOk(source);
    expect(names(asObject(source.context).concepts)).toEqual(expect.arrayContaining([
      "SerializedUnit",
      "SupplierLot",
      "RecallAffectedUnit"
    ]));

    // The manufacturing question names lots, defects, warranties, and recall
    // scope, so search should surface both serial-unit and recall concepts.
    const search = await mcp.tools.semantic_search_terms({
      question: "supplier lots defects warranty recall scope"
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(expect.arrayContaining([
      "SerializedUnit",
      "SupplierLot",
      "RecallAffectedUnit",
      "WarrantyClaim"
    ]));

    // Recall scope is its own relator, so the agent describes the concept
    // before joining it into traceability questions.
    const recallConcept = await mcp.tools.ontology_describe_concept({ concept: "RecallAffectedUnit" });
    expectOk(recallConcept);
    expect(asObject(recallConcept.concept)).toMatchObject({
      name: "RecallAffectedUnit",
      stereotype: "relator",
      sourceName: "recall_affected_units"
    });

    // Supplier quality needs lots, defects, and warranty claims from the serial
    // number grain, so the agent asks for the whole path set together.
    const paths = await mcp.tools.ontology_find_paths({
      from: "SerializedUnit",
      to: ["SupplierLot", "InspectionDefect", "WarrantyClaim"]
    });
    expectOk(paths);
    expect(paths).not.toHaveProperty("targets");
    expect(records(pathResult(paths, "SupplierLot").paths)[0]?.concepts).toEqual([
      "SerializedUnit",
      "InspectionDefect",
      "SupplierLot"
    ]);
    expect(records(pathResult(paths, "InspectionDefect").paths)[0]?.concepts).toEqual([
      "SerializedUnit",
      "InspectionDefect"
    ]);
    expect(records(pathResult(paths, "WarrantyClaim").paths)[0]?.concepts).toEqual([
      "SerializedUnit",
      "WarrantyClaim"
    ]);

    // Those paths are the prerequisites for the named supplier scorecard query.
    const validated = await mcp.tools.query_validate({ query: "supplier_quality_scorecard" });
    expectQuery(validated, "supplier_quality_scorecard", "SerializedUnit");
  });
});
