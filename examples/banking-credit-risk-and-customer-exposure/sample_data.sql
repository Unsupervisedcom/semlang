INSERT INTO legal_customers (
  legal_customer_id, customer_number, legal_name, customer_type, industry_code,
  relationship_group_id, domicile_country, relationship_manager, onboarded_date,
  kyc_status, risk_segment
) VALUES
  ('LC_ACME_DEV', 'CUST-10001', 'Acme Development LLC', 'operating_company', '531120', 'RG_ACME', 'US', 'Maya Patel', DATE '2019-06-14', 'current', 'commercial_real_estate'),
  ('LC_ACME_HOLD', 'CUST-10002', 'Acme Holdings Inc', 'holding_company', '551112', 'RG_ACME', 'US', 'Maya Patel', DATE '2019-06-14', 'current', 'middle_market'),
  ('LC_BRIGHT_MFG', 'CUST-20001', 'Bright Manufacturing Co', 'operating_company', '332710', 'RG_BRIGHT', 'US', 'Jon Lee', DATE '2021-03-08', 'refresh_due', 'middle_market'),
  ('LC_RIVER_TRUST', 'CUST-30001', 'River Family Trust', 'trust', '525920', 'RG_RIVER', 'US', 'Elena Woods', DATE '2020-09-21', 'current', 'private_bank'),
  ('LC_SBA_GOV', 'CUST-90001', 'US Small Business Guarantee Program', 'holding_company', '926150', NULL, 'US', 'Program Desk', DATE '2018-01-01', 'restricted', 'small_business');

INSERT INTO credit_facilities (
  facility_id, facility_number, legal_customer_id, facility_type, purpose,
  origination_date, maturity_date, commitment_amount, currency_code,
  revolver_flag, facility_status
) VALUES
  ('FAC_ACME_CRE', 'FAC-ACME-2024-01', 'LC_ACME_DEV', 'construction_line', 'Mixed-use construction draws', DATE '2024-02-01', DATE '2027-02-01', 12000000.00, 'USD', TRUE, 'watchlist'),
  ('FAC_BRIGHT_REV', 'FAC-BRIGHT-2023-01', 'LC_BRIGHT_MFG', 'revolver', 'Working capital revolver', DATE '2023-05-15', DATE '2026-05-15', 5000000.00, 'USD', TRUE, 'active'),
  ('FAC_BRIGHT_EQUIP', 'FAC-BRIGHT-2022-02', 'LC_BRIGHT_MFG', 'term_loan', 'Equipment modernization note', DATE '2022-09-01', DATE '2028-09-01', 2400000.00, 'USD', FALSE, 'active'),
  ('FAC_RIVER_CRE', 'FAC-RIVER-2021-01', 'LC_RIVER_TRUST', 'term_loan', 'Commercial property refinance', DATE '2021-11-10', DATE '2031-11-10', 3500000.00, 'USD', FALSE, 'active');

INSERT INTO loans (
  loan_id, loan_number, facility_id, legal_customer_id, loan_type, booked_date,
  maturity_date, original_principal_amount, interest_rate, payment_frequency,
  loan_status
) VALUES
  ('LOAN_ACME_DRAW1', 'LN-ACME-0001', 'FAC_ACME_CRE', 'LC_ACME_DEV', 'construction_draw', DATE '2024-03-01', DATE '2027-02-01', 6000000.00, 0.08750, 'interest_only', 'past_due'),
  ('LOAN_ACME_DRAW2', 'LN-ACME-0002', 'FAC_ACME_CRE', 'LC_ACME_DEV', 'construction_draw', DATE '2024-09-15', DATE '2027-02-01', 2500000.00, 0.08900, 'interest_only', 'current'),
  ('LOAN_BRIGHT_REV1', 'LN-BRIGHT-0001', 'FAC_BRIGHT_REV', 'LC_BRIGHT_MFG', 'working_capital_draw', DATE '2023-06-01', DATE '2026-05-15', 3000000.00, 0.07400, 'monthly', 'current'),
  ('LOAN_BRIGHT_EQ1', 'LN-BRIGHT-0002', 'FAC_BRIGHT_EQUIP', 'LC_BRIGHT_MFG', 'equipment_note', DATE '2022-09-01', DATE '2028-09-01', 2400000.00, 0.06650, 'monthly', 'current'),
  ('LOAN_RIVER_PROP', 'LN-RIVER-0001', 'FAC_RIVER_CRE', 'LC_RIVER_TRUST', 'commercial_mortgage', DATE '2021-11-10', DATE '2031-11-10', 3500000.00, 0.05250, 'monthly', 'nonaccrual');

INSERT INTO collateral_assets (
  collateral_asset_id, asset_reference, owner_customer_id, asset_type,
  jurisdiction, asset_description, initial_appraised_value, currency_code,
  active_from, retired_date
) VALUES
  ('COL_ACME_SITE', 'COLL-ACME-DEN-SITE', 'LC_ACME_DEV', 'commercial_property', 'Denver County, CO', 'Acme mixed-use construction site', 15500000.00, 'USD', DATE '2024-02-01', NULL),
  ('COL_ACME_GUAR_STOCK', 'COLL-ACME-HOLD-STOCK', 'LC_ACME_HOLD', 'marketable_securities', 'Delaware', 'Marketable securities pledged by parent', 1800000.00, 'USD', DATE '2024-02-01', NULL),
  ('COL_BRIGHT_AR', 'COLL-BRIGHT-AR', 'LC_BRIGHT_MFG', 'receivables', 'Ohio', 'Eligible trade receivables borrowing base', 4100000.00, 'USD', DATE '2023-05-15', NULL),
  ('COL_BRIGHT_EQUIP', 'COLL-BRIGHT-EQUIP', 'LC_BRIGHT_MFG', 'equipment', 'Ohio', 'CNC and fabrication equipment', 2900000.00, 'USD', DATE '2022-09-01', NULL),
  ('COL_RIVER_RETAIL', 'COLL-RIVER-RETAIL', 'LC_RIVER_TRUST', 'commercial_property', 'Salt Lake County, UT', 'River Crossing retail center', 4700000.00, 'USD', DATE '2021-11-10', NULL);

INSERT INTO collateral_valuations (
  collateral_valuation_id, collateral_asset_id, valuation_date, valid_from,
  valid_to, valuation_method, gross_collateral_value, haircut_percent,
  net_collateral_value, valuation_source
) VALUES
  ('VAL_ACME_SITE_2024Q4', 'COL_ACME_SITE', DATE '2024-12-15', DATE '2024-12-15', DATE '2025-04-01', 'appraisal', 14800000.00, 0.2500, 11100000.00, 'Northstar Appraisal'),
  ('VAL_ACME_SITE_2025Q1', 'COL_ACME_SITE', DATE '2025-03-20', DATE '2025-04-01', DATE '9999-12-31', 'appraisal', 14100000.00, 0.3000, 9870000.00, 'Northstar Appraisal'),
  ('VAL_ACME_STOCK_2025Q1', 'COL_ACME_GUAR_STOCK', DATE '2025-03-31', DATE '2025-03-31', DATE '9999-12-31', 'market_quote', 1650000.00, 0.1500, 1402500.00, 'Custody Feed'),
  ('VAL_BRIGHT_AR_2025Q1', 'COL_BRIGHT_AR', DATE '2025-03-31', DATE '2025-03-31', DATE '9999-12-31', 'borrowing_base', 3850000.00, 0.2000, 3080000.00, 'Borrowing Base Certificate'),
  ('VAL_BRIGHT_EQUIP_2025Q1', 'COL_BRIGHT_EQUIP', DATE '2025-03-15', DATE '2025-03-15', DATE '9999-12-31', 'automated_model', 2450000.00, 0.3500, 1592500.00, 'Equipment Value Service'),
  ('VAL_RIVER_RETAIL_2025Q1', 'COL_RIVER_RETAIL', DATE '2025-03-10', DATE '2025-03-10', DATE '9999-12-31', 'appraisal', 3900000.00, 0.3000, 2730000.00, 'Wasatch Appraisal');

INSERT INTO loan_collateral_links (
  loan_id, collateral_asset_id, effective_from, effective_to, lien_position,
  allocation_percent, secured_amount_cap, release_status
) VALUES
  ('LOAN_ACME_DRAW1', 'COL_ACME_SITE', DATE '2024-03-01', NULL, 1, 0.7000, 6000000.00, 'active'),
  ('LOAN_ACME_DRAW2', 'COL_ACME_SITE', DATE '2024-09-15', NULL, 1, 0.3000, 2500000.00, 'active'),
  ('LOAN_ACME_DRAW2', 'COL_ACME_GUAR_STOCK', DATE '2024-09-15', NULL, 2, 1.0000, 1000000.00, 'active'),
  ('LOAN_BRIGHT_REV1', 'COL_BRIGHT_AR', DATE '2023-06-01', NULL, 1, 1.0000, 3000000.00, 'active'),
  ('LOAN_BRIGHT_EQ1', 'COL_BRIGHT_EQUIP', DATE '2022-09-01', NULL, 1, 1.0000, 2200000.00, 'active'),
  ('LOAN_RIVER_PROP', 'COL_RIVER_RETAIL', DATE '2021-11-10', NULL, 1, 1.0000, 3500000.00, 'active');

INSERT INTO guarantees (
  guarantee_id, loan_id, guarantor_customer_id, guarantee_type, effective_from,
  effective_to, guaranteed_amount_cap, guarantee_percent, seniority,
  guarantee_status
) VALUES
  ('G_ACME_PARENT_DRAW1', 'LOAN_ACME_DRAW1', 'LC_ACME_HOLD', 'limited_recourse', DATE '2024-03-01', NULL, 3000000.00, 0.5000, 'primary', 'active'),
  ('G_ACME_PARENT_DRAW2', 'LOAN_ACME_DRAW2', 'LC_ACME_HOLD', 'full_recourse', DATE '2024-09-15', NULL, 2500000.00, 1.0000, 'primary', 'active'),
  ('G_BRIGHT_SBA_REV', 'LOAN_BRIGHT_REV1', 'LC_SBA_GOV', 'government_program', DATE '2023-06-01', NULL, 1500000.00, 0.5000, 'secondary', 'active'),
  ('G_RIVER_SPRING', 'LOAN_RIVER_PROP', 'LC_RIVER_TRUST', 'springing', DATE '2021-11-10', NULL, 750000.00, 0.2500, 'secondary', 'active');

INSERT INTO quarterly_reviews (
  review_id, legal_customer_id, facility_id, loan_id, review_quarter,
  review_due_date, submitted_at, approved_at, review_status, officer_name,
  committee_decision, covenant_status, recommended_rating_grade
) VALUES
  ('REV_ACME_2025Q1', 'LC_ACME_DEV', 'FAC_ACME_CRE', NULL, '2025Q1', DATE '2025-04-15', TIMESTAMP '2025-04-10 15:30:00', TIMESTAMP '2025-04-18 09:00:00', 'approved', 'Maya Patel', 'approve_with_conditions', 'breach_under_review', '7'),
  ('REV_BRIGHT_2025Q1', 'LC_BRIGHT_MFG', 'FAC_BRIGHT_REV', 'LOAN_BRIGHT_REV1', '2025Q1', DATE '2025-04-20', TIMESTAMP '2025-04-17 11:05:00', NULL, 'submitted', 'Jon Lee', 'defer', 'in_compliance', '4'),
  ('REV_RIVER_2025Q1', 'LC_RIVER_TRUST', 'FAC_RIVER_CRE', 'LOAN_RIVER_PROP', '2025Q1', DATE '2025-04-10', NULL, NULL, 'overdue', 'Elena Woods', NULL, 'breached', '8');

INSERT INTO risk_ratings (
  risk_rating_id, rating_scope, legal_customer_id, facility_id, loan_id,
  review_id, rating_grade, pd_band, effective_from, effective_to, assigned_at,
  assignment_source, rating_reason
) VALUES
  ('RR_ACME_CUST_2024Q4', 'customer', 'LC_ACME_DEV', NULL, NULL, NULL, '6', '2.50-4.00%', DATE '2024-10-01', DATE '2025-04-01', TIMESTAMP '2024-10-02 09:00:00', 'annual_review', 'Construction leasing lagged original plan'),
  ('RR_ACME_CUST_2025Q1', 'customer', 'LC_ACME_DEV', NULL, NULL, 'REV_ACME_2025Q1', '7', '4.00-6.50%', DATE '2025-04-01', DATE '9999-12-31', TIMESTAMP '2025-04-18 09:00:00', 'committee', 'Covenant pressure and higher carry costs'),
  ('RR_ACME_FAC_2025Q1', 'facility', NULL, 'FAC_ACME_CRE', NULL, 'REV_ACME_2025Q1', '7', '4.00-6.50%', DATE '2025-04-01', DATE '9999-12-31', TIMESTAMP '2025-04-18 09:00:00', 'quarterly_review', 'Facility moved to watchlist'),
  ('RR_BRIGHT_CUST_2025Q1', 'customer', 'LC_BRIGHT_MFG', NULL, NULL, 'REV_BRIGHT_2025Q1', '4', '0.75-1.25%', DATE '2025-04-01', DATE '9999-12-31', TIMESTAMP '2025-04-17 11:05:00', 'model', 'Stable cash flow and current borrowing base'),
  ('RR_RIVER_LOAN_2025Q1', 'loan', NULL, NULL, 'LOAN_RIVER_PROP', 'REV_RIVER_2025Q1', '8', '6.50-10.00%', DATE '2025-04-01', DATE '9999-12-31', TIMESTAMP '2025-04-11 08:30:00', 'analyst_override', 'Debt service shortfall and stale rent roll');

INSERT INTO model_score_snapshots (
  model_score_snapshot_id, as_of_date, legal_customer_id, loan_id, model_name,
  model_version, model_run_id, stress_scenario, accounting_basis,
  probability_of_default, loss_given_default, exposure_at_default_amount,
  ecl_amount, score_value, score_band, feature_set_version
) VALUES
  ('MS_ACME_D1_BASE_2025Q1', DATE '2025-03-31', 'LC_ACME_DEV', 'LOAN_ACME_DRAW1', 'Commercial PD LGD', 'v2025.1', 'RUN_2025Q1_BASE', 'base', 'cecl', 0.052000, 0.420000, 6100000.00, 133224.00, 612.400000, 'watch', 'fs_2025_03'),
  ('MS_ACME_D1_DOWN_2025Q1', DATE '2025-03-31', 'LC_ACME_DEV', 'LOAN_ACME_DRAW1', 'Commercial PD LGD', 'v2025.1', 'RUN_2025Q1_DOWN', 'downside', 'cecl', 0.081000, 0.480000, 6350000.00, 246888.00, 566.100000, 'criticized', 'fs_2025_03'),
  ('MS_BRIGHT_REV_BASE_2025Q1', DATE '2025-03-31', 'LC_BRIGHT_MFG', 'LOAN_BRIGHT_REV1', 'Commercial PD LGD', 'v2025.1', 'RUN_2025Q1_BASE', 'base', 'cecl', 0.014500, 0.350000, 3200000.00, 16240.00, 731.800000, 'pass', 'fs_2025_03'),
  ('MS_RIVER_BASE_2025Q1', DATE '2025-03-31', 'LC_RIVER_TRUST', 'LOAN_RIVER_PROP', 'CRE PD LGD', 'v2024.4', 'RUN_2025Q1_BASE', 'base', 'cecl', 0.112000, 0.520000, 3400000.00, 198016.00, 501.300000, 'problem', 'fs_2025_03');

INSERT INTO loan_exposure_snapshots (
  exposure_snapshot_id, as_of_date, reporting_quarter, loan_id, facility_id,
  legal_customer_id, accounting_basis, stress_scenario, model_run_id,
  model_version, outstanding_principal_amount, accrued_interest_amount,
  undrawn_commitment_amount, available_credit_amount, ead_amount, ecl_amount,
  rwa_amount, days_past_due, default_status, charge_off_amount, nonaccrual_flag
) VALUES
  ('EXP_ACME_D1_REG_BASE_2025Q1', DATE '2025-03-31', '2025Q1', 'LOAN_ACME_DRAW1', 'FAC_ACME_CRE', 'LC_ACME_DEV', 'regulatory', 'base', 'RUN_2025Q1_BASE', 'v2025.1', 5900000.00, 92000.00, 0.00, 0.00, 6100000.00, 128100.00, 4880000.00, 42, 'past_due', 0.00, FALSE),
  ('EXP_ACME_D2_REG_BASE_2025Q1', DATE '2025-03-31', '2025Q1', 'LOAN_ACME_DRAW2', 'FAC_ACME_CRE', 'LC_ACME_DEV', 'regulatory', 'base', 'RUN_2025Q1_BASE', 'v2025.1', 2400000.00, 21000.00, 3500000.00, 3500000.00, 4100000.00, 86100.00, 3280000.00, 0, 'performing', 0.00, FALSE),
  ('EXP_ACME_D1_CECL_DOWN_2025Q1', DATE '2025-03-31', '2025Q1', 'LOAN_ACME_DRAW1', 'FAC_ACME_CRE', 'LC_ACME_DEV', 'cecl', 'downside', 'RUN_2025Q1_DOWN', 'v2025.1', 5900000.00, 92000.00, 0.00, 0.00, 6350000.00, 246888.00, 5207000.00, 42, 'past_due', 0.00, FALSE),
  ('EXP_BRIGHT_REV_REG_BASE_2025Q1', DATE '2025-03-31', '2025Q1', 'LOAN_BRIGHT_REV1', 'FAC_BRIGHT_REV', 'LC_BRIGHT_MFG', 'regulatory', 'base', 'RUN_2025Q1_BASE', 'v2025.1', 2850000.00, 18000.00, 2000000.00, 2000000.00, 3200000.00, 16240.00, 2240000.00, 0, 'performing', 0.00, FALSE),
  ('EXP_BRIGHT_EQ_REG_BASE_2025Q1', DATE '2025-03-31', '2025Q1', 'LOAN_BRIGHT_EQ1', 'FAC_BRIGHT_EQUIP', 'LC_BRIGHT_MFG', 'regulatory', 'base', 'RUN_2025Q1_BASE', 'v2025.1', 1980000.00, 9000.00, 0.00, 0.00, 2020000.00, 12800.00, 1414000.00, 0, 'performing', 0.00, FALSE),
  ('EXP_RIVER_REG_BASE_2025Q1', DATE '2025-03-31', '2025Q1', 'LOAN_RIVER_PROP', 'FAC_RIVER_CRE', 'LC_RIVER_TRUST', 'regulatory', 'base', 'RUN_2025Q1_BASE', 'v2024.4', 3350000.00, 64000.00, 0.00, 0.00, 3400000.00, 198016.00, 3060000.00, 96, 'defaulted', 0.00, TRUE);

INSERT INTO review_documents (
  review_document_id, review_id, document_type, document_name,
  document_period_end, received_at, document_status, restricted_purpose,
  source_system
) VALUES
  ('DOC_ACME_FS_2025Q1', 'REV_ACME_2025Q1', 'financial_statement', 'Acme Development 2024 Financial Statements', DATE '2024-12-31', TIMESTAMP '2025-04-08 10:15:00', 'accepted', 'credit_review', 'Document Portal'),
  ('DOC_ACME_APPRAISAL_2025Q1', 'REV_ACME_2025Q1', 'collateral_appraisal', 'Acme Construction Site Appraisal', DATE '2025-03-20', TIMESTAMP '2025-04-09 12:40:00', 'accepted', 'collateral_review', 'Document Portal'),
  ('DOC_ACME_COV_2025Q1', 'REV_ACME_2025Q1', 'covenant_certificate', 'Acme Q1 Covenant Certificate', DATE '2025-03-31', TIMESTAMP '2025-04-10 15:20:00', 'rejected', 'credit_review', 'Document Portal'),
  ('DOC_BRIGHT_BBC_2025Q1', 'REV_BRIGHT_2025Q1', 'borrowing_base_certificate', 'Bright March Borrowing Base', DATE '2025-03-31', TIMESTAMP '2025-04-15 09:25:00', 'accepted', 'credit_review', 'Loan Ops'),
  ('DOC_BRIGHT_FS_2025Q1', 'REV_BRIGHT_2025Q1', 'financial_statement', 'Bright Manufacturing 2024 Financial Statements', DATE '2024-12-31', TIMESTAMP '2025-04-17 10:00:00', 'received', 'credit_review', 'Document Portal'),
  ('DOC_RIVER_RENT_2025Q1', 'REV_RIVER_2025Q1', 'rent_roll', 'River Crossing March Rent Roll', DATE '2025-03-31', NULL, 'requested', 'credit_review', 'Document Portal'),
  ('DOC_RIVER_SITE_2025Q1', 'REV_RIVER_2025Q1', 'site_inspection', 'River Crossing Site Inspection', DATE '2025-03-31', TIMESTAMP '2025-04-12 14:35:00', 'received', 'collateral_review', 'Field Inspection');
