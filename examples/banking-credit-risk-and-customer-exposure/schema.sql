CREATE TABLE legal_customers (
  legal_customer_id VARCHAR(30) PRIMARY KEY,
  customer_number VARCHAR(40) NOT NULL UNIQUE,
  legal_name VARCHAR(160) NOT NULL,
  customer_type VARCHAR(40) NOT NULL CHECK (customer_type IN ('operating_company', 'individual', 'trust', 'holding_company')),
  industry_code VARCHAR(20) NOT NULL,
  relationship_group_id VARCHAR(40),
  domicile_country VARCHAR(2) NOT NULL,
  relationship_manager VARCHAR(100) NOT NULL,
  onboarded_date DATE NOT NULL,
  kyc_status VARCHAR(30) NOT NULL CHECK (kyc_status IN ('current', 'refresh_due', 'restricted')),
  risk_segment VARCHAR(40) NOT NULL CHECK (risk_segment IN ('commercial_real_estate', 'middle_market', 'small_business', 'private_bank'))
);

CREATE TABLE credit_facilities (
  facility_id VARCHAR(30) PRIMARY KEY,
  facility_number VARCHAR(40) NOT NULL UNIQUE,
  legal_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  facility_type VARCHAR(40) NOT NULL CHECK (facility_type IN ('revolver', 'term_loan', 'construction_line', 'letter_of_credit')),
  purpose VARCHAR(120) NOT NULL,
  origination_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  commitment_amount NUMERIC(16, 2) NOT NULL CHECK (commitment_amount >= 0),
  currency_code VARCHAR(3) NOT NULL,
  revolver_flag BOOLEAN NOT NULL,
  facility_status VARCHAR(30) NOT NULL CHECK (facility_status IN ('active', 'watchlist', 'matured', 'charged_off')),
  CHECK (maturity_date > origination_date)
);

CREATE TABLE loans (
  loan_id VARCHAR(30) PRIMARY KEY,
  loan_number VARCHAR(40) NOT NULL UNIQUE,
  facility_id VARCHAR(30) NOT NULL REFERENCES credit_facilities(facility_id),
  legal_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  loan_type VARCHAR(40) NOT NULL CHECK (loan_type IN ('commercial_mortgage', 'equipment_note', 'working_capital_draw', 'construction_draw')),
  booked_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  original_principal_amount NUMERIC(16, 2) NOT NULL CHECK (original_principal_amount >= 0),
  interest_rate NUMERIC(7, 5) NOT NULL CHECK (interest_rate >= 0),
  payment_frequency VARCHAR(30) NOT NULL CHECK (payment_frequency IN ('monthly', 'quarterly', 'interest_only')),
  loan_status VARCHAR(30) NOT NULL CHECK (loan_status IN ('current', 'past_due', 'nonaccrual', 'charged_off', 'paid_off')),
  CHECK (maturity_date > booked_date)
);

CREATE TABLE collateral_assets (
  collateral_asset_id VARCHAR(30) PRIMARY KEY,
  asset_reference VARCHAR(60) NOT NULL UNIQUE,
  owner_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  asset_type VARCHAR(40) NOT NULL CHECK (asset_type IN ('commercial_property', 'equipment', 'receivables', 'marketable_securities')),
  jurisdiction VARCHAR(80) NOT NULL,
  asset_description VARCHAR(200) NOT NULL,
  initial_appraised_value NUMERIC(16, 2) NOT NULL CHECK (initial_appraised_value >= 0),
  currency_code VARCHAR(3) NOT NULL,
  active_from DATE NOT NULL,
  retired_date DATE,
  CHECK (retired_date IS NULL OR retired_date >= active_from)
);

CREATE TABLE collateral_valuations (
  collateral_valuation_id VARCHAR(40) PRIMARY KEY,
  collateral_asset_id VARCHAR(30) NOT NULL REFERENCES collateral_assets(collateral_asset_id),
  valuation_date DATE NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  valuation_method VARCHAR(40) NOT NULL CHECK (valuation_method IN ('appraisal', 'automated_model', 'borrowing_base', 'market_quote')),
  gross_collateral_value NUMERIC(16, 2) NOT NULL CHECK (gross_collateral_value >= 0),
  haircut_percent NUMERIC(7, 4) NOT NULL CHECK (haircut_percent >= 0 AND haircut_percent <= 1),
  net_collateral_value NUMERIC(16, 2) NOT NULL CHECK (net_collateral_value >= 0),
  valuation_source VARCHAR(80) NOT NULL,
  CHECK (valid_to > valid_from),
  UNIQUE (collateral_asset_id, valid_from)
);

CREATE TABLE loan_collateral_links (
  loan_id VARCHAR(30) NOT NULL REFERENCES loans(loan_id),
  collateral_asset_id VARCHAR(30) NOT NULL REFERENCES collateral_assets(collateral_asset_id),
  effective_from DATE NOT NULL,
  effective_to DATE,
  lien_position INTEGER NOT NULL CHECK (lien_position > 0),
  allocation_percent NUMERIC(7, 4) NOT NULL CHECK (allocation_percent > 0 AND allocation_percent <= 1),
  secured_amount_cap NUMERIC(16, 2) NOT NULL CHECK (secured_amount_cap >= 0),
  release_status VARCHAR(30) NOT NULL CHECK (release_status IN ('active', 'partial_release', 'released')),
  PRIMARY KEY (loan_id, collateral_asset_id, effective_from),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE guarantees (
  guarantee_id VARCHAR(30) PRIMARY KEY,
  loan_id VARCHAR(30) NOT NULL REFERENCES loans(loan_id),
  guarantor_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  guarantee_type VARCHAR(40) NOT NULL CHECK (guarantee_type IN ('full_recourse', 'limited_recourse', 'springing', 'government_program')),
  effective_from DATE NOT NULL,
  effective_to DATE,
  guaranteed_amount_cap NUMERIC(16, 2) NOT NULL CHECK (guaranteed_amount_cap >= 0),
  guarantee_percent NUMERIC(7, 4) NOT NULL CHECK (guarantee_percent > 0 AND guarantee_percent <= 1),
  seniority VARCHAR(30) NOT NULL CHECK (seniority IN ('primary', 'secondary')),
  guarantee_status VARCHAR(30) NOT NULL CHECK (guarantee_status IN ('active', 'expired', 'released')),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE quarterly_reviews (
  review_id VARCHAR(30) PRIMARY KEY,
  legal_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  facility_id VARCHAR(30) REFERENCES credit_facilities(facility_id),
  loan_id VARCHAR(30) REFERENCES loans(loan_id),
  review_quarter VARCHAR(6) NOT NULL,
  review_due_date DATE NOT NULL,
  submitted_at TIMESTAMP,
  approved_at TIMESTAMP,
  review_status VARCHAR(30) NOT NULL CHECK (review_status IN ('not_started', 'in_progress', 'submitted', 'approved', 'overdue', 'waived')),
  officer_name VARCHAR(100) NOT NULL,
  committee_decision VARCHAR(40) CHECK (committee_decision IN ('approve', 'approve_with_conditions', 'defer', 'not_required')),
  covenant_status VARCHAR(40) NOT NULL CHECK (covenant_status IN ('in_compliance', 'waived', 'breach_under_review', 'breached')),
  recommended_rating_grade VARCHAR(5),
  CHECK (approved_at IS NULL OR submitted_at IS NOT NULL),
  CHECK (loan_id IS NOT NULL OR facility_id IS NOT NULL)
);

CREATE TABLE risk_ratings (
  risk_rating_id VARCHAR(40) PRIMARY KEY,
  rating_scope VARCHAR(20) NOT NULL CHECK (rating_scope IN ('customer', 'facility', 'loan')),
  legal_customer_id VARCHAR(30) REFERENCES legal_customers(legal_customer_id),
  facility_id VARCHAR(30) REFERENCES credit_facilities(facility_id),
  loan_id VARCHAR(30) REFERENCES loans(loan_id),
  review_id VARCHAR(30) REFERENCES quarterly_reviews(review_id),
  rating_grade VARCHAR(5) NOT NULL,
  pd_band VARCHAR(40) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  assigned_at TIMESTAMP NOT NULL,
  assignment_source VARCHAR(40) NOT NULL CHECK (assignment_source IN ('model', 'analyst_override', 'committee', 'annual_review', 'quarterly_review')),
  rating_reason VARCHAR(200) NOT NULL,
  CHECK (effective_to > effective_from),
  CHECK (
    (rating_scope = 'customer' AND legal_customer_id IS NOT NULL AND facility_id IS NULL AND loan_id IS NULL)
    OR (rating_scope = 'facility' AND legal_customer_id IS NULL AND facility_id IS NOT NULL AND loan_id IS NULL)
    OR (rating_scope = 'loan' AND legal_customer_id IS NULL AND facility_id IS NULL AND loan_id IS NOT NULL)
  )
);

CREATE TABLE model_score_snapshots (
  model_score_snapshot_id VARCHAR(50) PRIMARY KEY,
  as_of_date DATE NOT NULL,
  legal_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  loan_id VARCHAR(30) REFERENCES loans(loan_id),
  model_name VARCHAR(80) NOT NULL,
  model_version VARCHAR(40) NOT NULL,
  model_run_id VARCHAR(60) NOT NULL,
  stress_scenario VARCHAR(40) NOT NULL CHECK (stress_scenario IN ('base', 'downside', 'severe_recession')),
  accounting_basis VARCHAR(30) NOT NULL CHECK (accounting_basis IN ('regulatory', 'cecl', 'ifrs9', 'management')),
  probability_of_default NUMERIC(9, 6) NOT NULL CHECK (probability_of_default >= 0 AND probability_of_default <= 1),
  loss_given_default NUMERIC(9, 6) NOT NULL CHECK (loss_given_default >= 0 AND loss_given_default <= 1),
  exposure_at_default_amount NUMERIC(16, 2) NOT NULL CHECK (exposure_at_default_amount >= 0),
  ecl_amount NUMERIC(16, 2) NOT NULL CHECK (ecl_amount >= 0),
  score_value NUMERIC(12, 6) NOT NULL,
  score_band VARCHAR(30) NOT NULL,
  feature_set_version VARCHAR(40) NOT NULL,
  UNIQUE (as_of_date, legal_customer_id, loan_id, model_name, model_version, model_run_id, stress_scenario, accounting_basis)
);

CREATE TABLE loan_exposure_snapshots (
  exposure_snapshot_id VARCHAR(50) PRIMARY KEY,
  as_of_date DATE NOT NULL,
  reporting_quarter VARCHAR(6) NOT NULL,
  loan_id VARCHAR(30) NOT NULL REFERENCES loans(loan_id),
  facility_id VARCHAR(30) NOT NULL REFERENCES credit_facilities(facility_id),
  legal_customer_id VARCHAR(30) NOT NULL REFERENCES legal_customers(legal_customer_id),
  accounting_basis VARCHAR(30) NOT NULL CHECK (accounting_basis IN ('regulatory', 'cecl', 'ifrs9', 'management')),
  stress_scenario VARCHAR(40) NOT NULL CHECK (stress_scenario IN ('base', 'downside', 'severe_recession')),
  model_run_id VARCHAR(60) NOT NULL,
  model_version VARCHAR(40) NOT NULL,
  outstanding_principal_amount NUMERIC(16, 2) NOT NULL CHECK (outstanding_principal_amount >= 0),
  accrued_interest_amount NUMERIC(16, 2) NOT NULL CHECK (accrued_interest_amount >= 0),
  undrawn_commitment_amount NUMERIC(16, 2) NOT NULL CHECK (undrawn_commitment_amount >= 0),
  available_credit_amount NUMERIC(16, 2) NOT NULL CHECK (available_credit_amount >= 0),
  ead_amount NUMERIC(16, 2) NOT NULL CHECK (ead_amount >= 0),
  ecl_amount NUMERIC(16, 2) NOT NULL CHECK (ecl_amount >= 0),
  rwa_amount NUMERIC(16, 2) NOT NULL CHECK (rwa_amount >= 0),
  days_past_due INTEGER NOT NULL CHECK (days_past_due >= 0),
  default_status VARCHAR(30) NOT NULL CHECK (default_status IN ('performing', 'past_due', 'defaulted', 'charged_off')),
  charge_off_amount NUMERIC(16, 2) NOT NULL CHECK (charge_off_amount >= 0),
  nonaccrual_flag BOOLEAN NOT NULL,
  UNIQUE (as_of_date, loan_id, accounting_basis, stress_scenario, model_run_id)
);

CREATE TABLE review_documents (
  review_document_id VARCHAR(40) PRIMARY KEY,
  review_id VARCHAR(30) NOT NULL REFERENCES quarterly_reviews(review_id),
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('financial_statement', 'rent_roll', 'borrowing_base_certificate', 'collateral_appraisal', 'tax_return', 'covenant_certificate', 'site_inspection', 'model_validation_note')),
  document_name VARCHAR(160) NOT NULL,
  document_period_end DATE,
  received_at TIMESTAMP,
  document_status VARCHAR(30) NOT NULL CHECK (document_status IN ('requested', 'received', 'accepted', 'rejected', 'waived')),
  restricted_purpose VARCHAR(50) NOT NULL CHECK (restricted_purpose IN ('credit_review', 'collateral_review', 'regulatory_reporting', 'model_validation')),
  source_system VARCHAR(60) NOT NULL,
  CHECK (
    (document_status IN ('received', 'accepted', 'rejected') AND received_at IS NOT NULL)
    OR document_status IN ('requested', 'waived')
  )
);
