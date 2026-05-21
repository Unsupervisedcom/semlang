// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import { asObject, expectOk, expectQuery, names, pathResult, records, tempExamplePath, text } from "./helpers.js";

describe("SemLang MCP domain example narratives", () => {
  it("uses SaaS source, search, metric explanation, array paths, and validation", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("saas-product-usage-and-revenue");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);
    expect(names(asObject(source.context).concepts)).toEqual(
      expect.arrayContaining(["SubscriptionPeriod", "RevenueRecognitionEntry", "FeatureUsageDay"]),
    );

    // The SaaS fixture warns that ARR, recognized revenue, and usage have
    // distinct grains, so search should surface multiple candidate roots.
    const search = await mcp.tools.semantic_search_terms({
      question: "recognized revenue ARR movement subscription product usage",
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(
      expect.arrayContaining(["SubscriptionPeriod", "RevenueRecognitionEntry", "FeatureUsageDay"]),
    );

    // Since "recognized revenue" is an accounting measure, the agent asks the
    // ontology to explain the metric rather than treating invoice total as ARR.
    const metric = await mcp.tools.ontology_explain_metric({ metric: "recognized_revenue" });
    expectOk(metric);
    expect(records(metric.metrics)[0]).toMatchObject({
      concept: "RevenueRecognitionEntry",
      name: "recognized_revenue",
      expression: "sum(recognized_revenue_amount)",
    });

    // For entitlement-aware usage, the agent needs feature, entitlement, and
    // plan context from the FeatureUsageDay root in one array request.
    const paths = await mcp.tools.ontology_find_paths({
      from: "FeatureUsageDay",
      to: ["ProductFeature", "EntitlementInterval", "ProductPlan"],
    });
    expectOk(paths);
    expect(paths).not.toHaveProperty("targets");
    expect(records(pathResult(paths, "ProductFeature").paths)[0]?.concepts).toEqual([
      "FeatureUsageDay",
      "ProductFeature",
    ]);
    expect(records(pathResult(paths, "EntitlementInterval").paths)[0]?.concepts).toEqual([
      "FeatureUsageDay",
      "EntitlementInterval",
    ]);
    expect(records(pathResult(paths, "ProductPlan").paths)[0]?.concepts).toEqual(["FeatureUsageDay", "ProductPlan"]);

    // 02.05.014: With those joins confirmed, the named usage query should dry-run
    // validate at the FeatureUsageDay grain.
    const validated = await mcp.tools.query_run({ query: "entitlement_aware_usage", dry_run_only: true });
    expectQuery(validated, "entitlement_aware_usage", "FeatureUsageDay");

    // 06.07.004 / 06.10.003: subject:new actions should describe their insert
    // mappings and create rows in the temp-mounted DuckDB database.
    const supportConcept = await mcp.tools.ontology_describe_concept({ concept: "SupportCase" });
    expectOk(supportConcept);
    expect(names(asObject(supportConcept.concept).actions)).toEqual(["open_case"]);

    const openCaseAction = await mcp.tools.ontology_describe_action({
      concept: "SupportCase",
      name: "open_case",
    });
    expectOk(openCaseAction);
    expect(asObject(openCaseAction.action)).toMatchObject({
      concept: "SupportCase",
      name: "open_case",
      subject: { mode: "new" },
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
        category: "workflow_error",
      },
    });
    expect(opened).toMatchObject({
      ok: true,
      engine: "duckdb",
      action: "open_case",
      concept: "SupportCase",
      changedRowCount: 1,
    });
    expect(text(opened.sql)).toContain('INSERT INTO "support_cases"');
    expect(records(opened.rows)[0]).toMatchObject({
      support_case_id: "CASE_MCP_OPEN_1",
      account_id: "ACCT_ACME",
      priority: "urgent",
      case_status: "open",
      channel: "chat",
      category: "workflow_error",
      sla_paused_minutes: 0,
    });
  });

  it("uses banking source, search, lens planning, and regulatory watchlist validation", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("banking-credit-risk-and-customer-exposure", "example_with_lens.semlang");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);
    expect(names(asObject(source.context).lenses)).toEqual(
      expect.arrayContaining([
        "regulatory_base_reporting",
        "commercial_real_estate_concentration",
        "watchlist_credit_review",
      ]),
    );

    // The banking question mixes regulatory scope, CRE concentration, and
    // officer action, so search should identify the exposure root and risk paths.
    const search = await mcp.tools.semantic_search_terms({
      question: "regulatory CRE watchlist exposure after guarantee collateral",
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(
      expect.arrayContaining(["LoanExposureSnapshot", "Guarantee", "LoanCollateralLink"]),
    );

    // The comment in the fixture points to lens.plan for composing the
    // regulatory, CRE, and watchlist overlays before validating the queue.
    const plan = await mcp.tools.lens_plan({
      question: "regulatory CRE watchlist queue",
      lenses: ["regulatory_base_reporting", "commercial_real_estate_concentration", "watchlist_credit_review"],
    });
    expectOk(plan);
    expect(names(plan.lenses)).toEqual([
      "regulatory_base_reporting",
      "commercial_real_estate_concentration",
      "watchlist_credit_review",
    ]);
    expect(records(plan.steps).map((step) => step.lens)).toEqual([
      "regulatory_base_reporting",
      "commercial_real_estate_concentration",
      "watchlist_credit_review",
    ]);

    // 02.05.014: Once the lens stack is known, the composed named query should
    // dry-run validate on LoanExposureSnapshot with the regulatory_cre_watchlist lens applied.
    const validated = await mcp.tools.query_run({ query: "cre_regulatory_watchlist_queue", dry_run_only: true });
    const query = expectQuery(validated, "cre_regulatory_watchlist_queue", "LoanExposureSnapshot");
    expect(query.lenses).toEqual(["regulatory_cre_watchlist"]);
  });

  it("uses healthcare source, search, temporal axes, paths, and discharge audit validation", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("healthcare-patient-journey-and-quality-measures");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);
    expect(names(asObject(source.context).concepts)).toEqual(
      expect.arrayContaining(["InpatientStay", "DiagnosisInterval", "QualityMeasurePopulation"]),
    );

    // The healthcare question asks about diagnoses active at discharge, so
    // search should keep the discharge denominator root and diagnosis interval.
    const search = await mcp.tools.semantic_search_terms({
      question: "readmission denominator diagnosis active at discharge",
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(expect.arrayContaining(["InpatientStay", "DiagnosisInterval"]));

    // Active-at-discharge language is temporal, so the agent inspects the valid
    // time axes before asking for the join path.
    const axes = await mcp.tools.ontology_describe_temporal_axes({ concept: "DiagnosisInterval" });
    expectOk(axes);
    expect(records(axes.axes).map((axis) => axis.axis)).toEqual(["valid_time", "observation_time", "recorded_time"]);
    expect(records(axes.axes)[0]?.expression).toBe("period(clinical_valid_start, clinical_valid_end)");

    // The path should make the discharge-date temporal join explicit.
    const paths = await mcp.tools.ontology_find_paths({
      from: "InpatientStay",
      to: "DiagnosisInterval",
    });
    expectOk(paths);
    const dischargePath = records(pathResult(paths, "DiagnosisInterval").paths)[0];
    expect(dischargePath.concepts).toEqual(["InpatientStay", "DiagnosisInterval"]);
    expect(records(dischargePath.steps)[0]).toMatchObject({
      join: "diagnoses_at_discharge",
      kind: "join_many",
      at: "discharge_date",
    });

    // 02.05.014: With the temporal path established, the denominator audit query
    // should dry-run validate without changing the inpatient stay grain.
    const validated = await mcp.tools.query_run({ query: "discharge_diagnosis_denominator_audit", dry_run_only: true });
    expectQuery(validated, "discharge_diagnosis_denominator_audit", "InpatientStay");
  });

  it("uses manufacturing source, search, concept description, array paths, and supplier quality validation", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("manufacturing-supply-chain-traceability-and-quality");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);
    expect(names(asObject(source.context).concepts)).toEqual(
      expect.arrayContaining(["SerializedUnit", "SupplierLot", "RecallAffectedUnit"]),
    );

    // The manufacturing question names lots, defects, warranties, and recall
    // scope, so search should surface both serial-unit and recall concepts.
    const search = await mcp.tools.semantic_search_terms({
      question: "supplier lots defects warranty recall scope",
    });
    expectOk(search);
    expect(names(search.concepts)).toEqual(
      expect.arrayContaining(["SerializedUnit", "SupplierLot", "RecallAffectedUnit", "WarrantyClaim"]),
    );

    // Recall scope is its own relator, so the agent describes the concept
    // before joining it into traceability questions.
    const recallConcept = await mcp.tools.ontology_describe_concept({ concept: "RecallAffectedUnit" });
    expectOk(recallConcept);
    expect(asObject(recallConcept.concept)).toMatchObject({
      name: "RecallAffectedUnit",
      stereotype: "relator",
      sourceName: "recall_affected_units",
    });

    // Supplier quality needs lots, defects, and warranty claims from the serial
    // number grain, so the agent asks for the whole path set together.
    const paths = await mcp.tools.ontology_find_paths({
      from: "SerializedUnit",
      to: ["SupplierLot", "InspectionDefect", "WarrantyClaim"],
    });
    expectOk(paths);
    expect(paths).not.toHaveProperty("targets");
    expect(records(pathResult(paths, "SupplierLot").paths)[0]?.concepts).toEqual([
      "SerializedUnit",
      "InspectionDefect",
      "SupplierLot",
    ]);
    expect(records(pathResult(paths, "InspectionDefect").paths)[0]?.concepts).toEqual([
      "SerializedUnit",
      "InspectionDefect",
    ]);
    expect(records(pathResult(paths, "WarrantyClaim").paths)[0]?.concepts).toEqual(["SerializedUnit", "WarrantyClaim"]);

    // 02.05.014: Those paths are the prerequisites for dry-running the named
    // supplier scorecard query.
    const validated = await mcp.tools.query_run({ query: "supplier_quality_scorecard", dry_run_only: true });
    expectQuery(validated, "supplier_quality_scorecard", "SerializedUnit");
  });
});
