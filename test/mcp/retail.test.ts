// These MCP tests are written as agent narratives: each test calls tools in the
// order an agent would, with comments explaining why the next request follows.

/*
 * Purpose: Verifies MCP semantic search, catalog, ontology, lens, and query behavior on the retail example.
 * Encapsulation: Keep retail-domain MCP expectations here; cross-domain examples and execution-specific checks live in separate files.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSemLangMcp } from "../../src/index.js";
import {
  asObject,
  executionRecords,
  expectOk,
  expectQuery,
  names,
  pathResult,
  records,
  tempExamplePath,
  text,
} from "./helpers.js";

describe("SemLang MCP retail narratives", () => {
  it("walks the retail base ontology from search to generated Malloy", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("retail-omnichannel-margin-and-returns");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);
    const context = asObject(source.context);
    expect(names(context.concepts)).toEqual(expect.arrayContaining(["SaleLine", "Store", "ProductSKU", "ReturnLine"]));
    expect(names(context.queries)).toContain("monthly_margin_and_returns");

    // The agent starts from the business phrase and checks which concepts,
    // metrics, and named queries the ontology thinks are relevant.
    const search = await mcp.tools.semantic_search_terms({
      question: "monthly margin and returns by region and product category",
    });
    expectOk(search);
    const conceptMatches = records(search.concepts);
    expect(conceptMatches.map((concept) => concept.name)).toEqual(
      expect.arrayContaining(["SaleLine", "Store", "ReturnLine"]),
    );
    expect(conceptMatches.find((concept) => concept.name === "SaleLine")).toMatchObject({
      description: expect.stringContaining("Sold SKU line fact grain"),
    });
    expect(names(search.metrics)).toEqual(expect.arrayContaining(["merchandising_margin", "settled_refund_amount"]));
    expect(names(search.queries)).toContain("monthly_margin_and_returns");

    // The query groups by store and product while aggregating return measures,
    // so the agent asks for all required paths in one array-valued call.
    const paths = await mcp.tools.ontology_find_paths({
      from: "SaleLine",
      to: ["Store", "ProductSKU", "ReturnLine"],
    });
    expectOk(paths);
    expect(paths).not.toHaveProperty("targets");
    expect(records(pathResult(paths, "Store").paths)[0]?.concepts).toEqual(["SaleLine", "Sale", "Store"]);
    expect(records(pathResult(paths, "ProductSKU").paths)[0]?.concepts).toEqual(["SaleLine", "ProductSKU"]);
    expect(records(pathResult(paths, "ReturnLine").paths)[0]?.concepts).toEqual(["SaleLine", "ReturnLine"]);

    // 02.05.014: The named query already encodes the selected root, groupings,
    // and measures, so dry-run execution should validate without running SQL.
    const validated = await mcp.tools.query_run({ query: "monthly_margin_and_returns", dry_run_only: true });
    const validatedQuery = expectQuery(validated, "monthly_margin_and_returns", "SaleLine");
    expect(validatedQuery.lenses).toEqual([]);
    expect(validated).not.toHaveProperty("malloy");
    expect(asObject(validated.execution)).toMatchObject({ skipped: true });

    // 02.05.012: query.run should expose the generated query Malloy and execute
    // it through the Malloy runtime without returning the full Malloy model.
    const run = await mcp.tools.query_run({ query: "monthly_margin_and_returns", query_limit_seconds: 30 });
    expectQuery(run, "monthly_margin_and_returns", "SaleLine");
    expect(run).not.toHaveProperty("malloy");
    expect(text(run.queryMalloy)).toContain("query: monthly_margin_and_returns is retail_line_items ->");
    expect(text(run.queryMalloy)).toContain("merchandising_margin");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true });
    expect(execution).not.toHaveProperty("skipped", true);
    const marginRows = await executionRecords(execution);
    expect(marginRows.length).toBeGreaterThan(0);
    expect(marginRows[0]).toEqual(
      expect.objectContaining({
        sold_month: "2025-03-01T00:00:00.000Z",
        region: "Mountain",
        category_name: "Outerwear",
        net_sales: 159,
        merchandising_margin: 41,
      }),
    );

    // 06.01.004 / 06.10.003: Action-aware agents should see available actions
    // in concept details before invoking a write against the temp-mounted data.
    const returnConcept = await mcp.tools.ontology_describe_concept({ concept: "ReturnLine" });
    expectOk(returnConcept);
    expect(names(asObject(returnConcept.concept).actions)).toEqual(["settle_return"]);

    const settleAction = await mcp.tools.ontology_describe_action({ action: "settle_return" });
    expectOk(settleAction);
    expect(asObject(settleAction.action)).toMatchObject({
      concept: "ReturnLine",
      name: "settle_return",
      subject: { mode: "single" },
    });

    const settled = await mcp.tools.action_invoke({
      action: "settle_return",
      subject: { return_line_id: "RET_50002_1" },
      params: {
        approved_refund_amount: 121.25,
        approved_restocking_fee_amount: 4.5,
      },
    });
    expect(settled).toMatchObject({
      ok: true,
      engine: "malloy",
      action: "settle_return",
      concept: "ReturnLine",
      operation: "update",
      changedRowCount: 1,
    });
    expect(text(settled.sql)).toContain('UPDATE "return_lines" AS root');
    expect(records(settled.rows)[0]).toMatchObject({
      return_line_id: "RET_50002_1",
      return_status: "settled",
      refund_amount: "121.25",
      restocking_fee_amount: "4.50",
    });

    // action.invoke now executes through the configured Malloy connection using
    // generated SQL for supported action edits.
  });

  it("resolves a retail business entity and sends the customer-count query to Malloy", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("retail-omnichannel-margin-and-returns");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);

    // If a user supplies a business label like "Denver", the agent first asks
    // for ontology-backed candidate fields before applying a concrete filter.
    const entity = await mcp.tools.catalog_resolve_entity({ concept: "Store", business_name: "Denver" });
    expectOk(entity);
    expect(entity).toMatchObject({ concept: "Store", business_name: "Denver" });
    const storeCandidate = records(entity.candidates)[0];
    expect(names(storeCandidate?.candidateFields)).toEqual(
      expect.arrayContaining(["store_name", "region", "store_label"]),
    );
    expect(records(storeCandidate?.rows)[0]).toMatchObject({
      store_code: "DEN-01",
      store_name: "Denver Cherry Creek",
    });

    // The example query encodes the resulting store filter; query.run should
    // hand it to Malloy execution.
    const run = await mcp.tools.query_run({
      query: "denver_store_customer_count_on_2025_09_15",
      query_limit_seconds: 30,
    });
    expectQuery(run, "denver_store_customer_count_on_2025_09_15", "Sale");
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true });
    expect(execution).not.toHaveProperty("skipped", true);
    expect((await executionRecords(execution))[0]).toEqual(
      expect.objectContaining({
        sales: 0,
        identified_customer_sales: 0,
        identified_customers: 0,
        unrecognized_cash_sales: 0,
      }),
    );
  });

  it("walks the retail lens ontology through suggestion, PII requirements, and lens-local Malloy", async () => {
    const mcp = createSemLangMcp();
    const sourcePath = await tempExamplePath("retail-omnichannel-margin-and-returns", "example_with_lens.semlang");

    const source = await mcp.tools.set_ontology_source({
      path: sourcePath,
      projectDir: path.dirname(sourcePath),
    });
    expectOk(source);
    const context = asObject(source.context);
    expect(names(context.lenses)).toEqual(expect.arrayContaining(["western_margin_operations", "with_pii"]));

    // The agent has a role/context phrase, so it asks which lens overlays match
    // before choosing a governed query surface.
    const suggested = await mcp.tools.lens_suggest({
      user_context: "western margin returns intervention with customer contact",
    });
    expectOk(suggested);
    expect(names(suggested.lenses)).toEqual(
      expect.arrayContaining(["western_margin_operations", "margin_operations", "with_pii"]),
    );

    // The top suggested lens is composed, so the agent inspects its parents and
    // direct refinements before expanding the model.
    const described = await mcp.tools.lens_describe({ lens: "western_margin_operations" });
    expectOk(described);
    const describedLens = asObject(described.lens);
    expect(describedLens.parents).toEqual(["western_region", "margin_operations"]);
    expect(records(describedLens.refinements)[0]).toMatchObject({
      lens: "western_margin_operations",
      concept: "SaleLine",
      views: ["western_margin_risk_by_category"],
    });

    // Expansion checks that parent lenses are applied and margin operations add
    // the temporary risk-band type the query needs.
    const expanded = await mcp.tools.lens_expand({
      lens: "western_margin_operations",
      concept: "SaleLine",
    });
    expectOk(expanded);
    expect(names(asObject(expanded.model).types)).toContain("MarginRiskBand");
    expect(records(expanded.refinements)[0]).toMatchObject({
      lens: "western_margin_operations",
      concept: "SaleLine",
    });

    // Before producing a customer-service queue, the agent asks which lens owns
    // contact/PII fields rather than assuming they exist in the base ontology.
    const piiFields = await mcp.tools.lens_required_fields({
      fields: ["contact_email", "phone_number", "customer_contact_email"],
    });
    expectOk(piiFields);
    expect(piiFields.requestedFields).toEqual(["contact_email", "phone_number", "customer_contact_email"]);
    const piiMatches = records(piiFields.matches);
    const customerPii = piiMatches.find((match) => match.lens === "with_pii" && match.concept === "Customer");
    expect(customerPii).toEqual(expect.objectContaining({ lens: "with_pii", concept: "Customer" }));
    expect(records((customerPii as Record<string, unknown>).matches)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "contact_email",
          exposedAs: [
            expect.objectContaining({ field: "contact_email", kind: "dimension", expression: "email_address" }),
          ],
        }),
        expect.objectContaining({
          field: "phone_number",
          exposedAs: [expect.objectContaining({ field: "phone_number", kind: "field", typeName: "string" })],
          requiredByExpressions: ["phone_number"],
        }),
      ]),
    );
    const salePii = piiMatches.find((match) => match.lens === "with_pii" && match.concept === "Sale");
    expect(records(salePii?.matches)).toContainEqual(
      expect.objectContaining({
        field: "customer_contact_email",
        exposedAs: [expect.objectContaining({ field: "customer_contact_email", expression: "customer.contact_email" })],
      }),
    );

    // The lens queries should validate as named examples because their roots and
    // lens lists are declared in the fixture.
    const interventionValidated = await mcp.tools.query_run({
      query: "western_margin_intervention_queue",
      dry_run_only: true,
    });
    const interventionQuery = expectQuery(interventionValidated, "western_margin_intervention_queue", "SaleLine");
    expect(interventionQuery.lenses).toEqual(["western_margin_operations"]);

    const piiValidated = await mcp.tools.query_run({ query: "pii_customer_service_returns", dry_run_only: true });
    const piiQuery = expectQuery(piiValidated, "pii_customer_service_returns", "ReturnLine");
    expect(piiQuery.lenses).toEqual(["with_pii"]);

    // 02.05.024: temporary lens queries reuse the cached base Malloy and only
    // append the lens-local Malloy needed for the requested query.
    mcp.getContext().sourceText = "package retail.corrupted\nthis is not valid SemLang";
    const temporaryLensQuery = await mcp.tools.query_run({
      root: "SaleLine",
      lens: "western_margin_operations",
      where: 'margin_risk_band = "intervene"',
      aggregate: ["lines_to_intervene", "intervention_net_sales"],
      query_limit_seconds: 30,
    });
    expectOk(temporaryLensQuery);
    expect(temporaryLensQuery).toMatchObject({
      queryName: "__mcp_query",
      root: "SaleLine",
      lenses: ["western_margin_operations"],
    });
    expect(temporaryLensQuery).not.toHaveProperty("malloy");
    expect(text(temporaryLensQuery.queryMalloy)).toContain("query: __mcp_query is retail_line_items____mcp_query ->");
    expect(asObject(temporaryLensQuery.execution)).toMatchObject({ ok: true });

    // 02.05.012: Running a lens query should produce lens-local query Malloy
    // and hand execution to the Malloy runtime without the full model.
    const run = await mcp.tools.query_run({ query: "western_margin_intervention_queue", query_limit_seconds: 30 });
    expectQuery(run, "western_margin_intervention_queue", "SaleLine");
    expect(run).not.toHaveProperty("malloy");
    expect(text(run.queryMalloy)).toContain(
      "query: western_margin_intervention_queue is retail_line_items__western_margin_intervention_queue ->",
    );
    const execution = asObject(run.execution);
    expect(execution).toMatchObject({ ok: true });
  });
});
