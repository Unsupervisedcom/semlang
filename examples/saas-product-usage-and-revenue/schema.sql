CREATE TABLE accounts (
  account_id VARCHAR(30) PRIMARY KEY,
  account_name VARCHAR(120) NOT NULL,
  segment VARCHAR(30) NOT NULL CHECK (segment IN ('startup', 'mid_market', 'enterprise')),
  industry VARCHAR(80) NOT NULL,
  region VARCHAR(50) NOT NULL,
  billing_country VARCHAR(50) NOT NULL,
  account_owner VARCHAR(100) NOT NULL,
  created_date DATE NOT NULL
);

CREATE TABLE workspaces (
  workspace_id VARCHAR(30) PRIMARY KEY,
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  workspace_name VARCHAR(120) NOT NULL,
  workspace_type VARCHAR(30) NOT NULL CHECK (workspace_type IN ('production', 'sandbox', 'internal')),
  created_at TIMESTAMP NOT NULL,
  archived_at TIMESTAMP,
  CHECK (archived_at IS NULL OR archived_at >= created_at)
);

CREATE TABLE users (
  user_id VARCHAR(30) PRIMARY KEY,
  workspace_id VARCHAR(30) NOT NULL REFERENCES workspaces(workspace_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  external_user_key VARCHAR(80) NOT NULL,
  user_role VARCHAR(30) NOT NULL CHECK (user_role IN ('admin', 'builder', 'viewer')),
  seat_type VARCHAR(30) NOT NULL CHECK (seat_type IN ('paid', 'free', 'service')),
  created_at TIMESTAMP NOT NULL,
  deactivated_at TIMESTAMP,
  CHECK (deactivated_at IS NULL OR deactivated_at >= created_at),
  UNIQUE (workspace_id, external_user_key)
);

CREATE TABLE product_plans (
  plan_id VARCHAR(30) PRIMARY KEY,
  plan_code VARCHAR(40) NOT NULL UNIQUE,
  plan_family VARCHAR(40) NOT NULL CHECK (plan_family IN ('team', 'business', 'enterprise')),
  billing_interval VARCHAR(20) NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
  base_arr_amount NUMERIC(14, 2) NOT NULL CHECK (base_arr_amount >= 0),
  included_seats INTEGER NOT NULL CHECK (included_seats >= 0),
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE product_features (
  feature_key VARCHAR(40) PRIMARY KEY,
  feature_name VARCHAR(120) NOT NULL,
  feature_family VARCHAR(50) NOT NULL,
  telemetry_event_name VARCHAR(80) NOT NULL UNIQUE,
  release_date DATE NOT NULL
);

CREATE TABLE subscriptions (
  subscription_id VARCHAR(40) PRIMARY KEY,
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  plan_id VARCHAR(30) NOT NULL REFERENCES product_plans(plan_id),
  subscription_state VARCHAR(30) NOT NULL CHECK (subscription_state IN ('active', 'cancel_pending', 'churned', 'paused')),
  start_date DATE NOT NULL,
  cancellation_requested_at TIMESTAMP,
  churn_effective_date DATE,
  current_term_start DATE NOT NULL,
  current_term_end DATE NOT NULL,
  paid_seats INTEGER NOT NULL CHECK (paid_seats >= 0),
  contracted_arr NUMERIC(14, 2) NOT NULL CHECK (contracted_arr >= 0),
  billing_currency CHAR(3) NOT NULL,
  CHECK (current_term_end > current_term_start),
  CHECK (churn_effective_date IS NULL OR churn_effective_date >= start_date)
);

CREATE TABLE contracts (
  contract_id VARCHAR(40) PRIMARY KEY,
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  contract_number VARCHAR(40) NOT NULL UNIQUE,
  contract_type VARCHAR(30) NOT NULL CHECK (contract_type IN ('new', 'renewal', 'expansion', 'contraction')),
  signed_at TIMESTAMP NOT NULL,
  contract_start_date DATE NOT NULL,
  contract_end_date DATE NOT NULL,
  booking_arr NUMERIC(14, 2) NOT NULL CHECK (booking_arr >= 0),
  prior_arr NUMERIC(14, 2) NOT NULL CHECK (prior_arr >= 0),
  arr_delta NUMERIC(14, 2) NOT NULL,
  auto_renewal BOOLEAN NOT NULL,
  CHECK (contract_end_date > contract_start_date)
);

CREATE TABLE subscription_periods (
  subscription_period_id VARCHAR(50) PRIMARY KEY,
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  plan_id VARCHAR(30) NOT NULL REFERENCES product_plans(plan_id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_state VARCHAR(30) NOT NULL CHECK (period_state IN ('active', 'cancel_pending', 'churned', 'paused')),
  paid_seats INTEGER NOT NULL CHECK (paid_seats >= 0),
  starting_arr NUMERIC(14, 2) NOT NULL CHECK (starting_arr >= 0),
  ending_arr NUMERIC(14, 2) NOT NULL CHECK (ending_arr >= 0),
  arr_delta NUMERIC(14, 2) NOT NULL,
  churn_effective_flag BOOLEAN NOT NULL,
  prior_arr_amount NUMERIC(14, 2) NOT NULL CHECK (prior_arr_amount >= 0),
  CHECK (period_end > period_start),
  UNIQUE (subscription_id, period_start)
);

CREATE TABLE invoices (
  invoice_id VARCHAR(40) PRIMARY KEY,
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  invoice_status VARCHAR(30) NOT NULL CHECK (invoice_status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  invoice_total NUMERIC(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL,
  CHECK (due_date >= invoice_date)
);

CREATE TABLE invoice_lines (
  invoice_line_id VARCHAR(50) PRIMARY KEY,
  invoice_id VARCHAR(40) NOT NULL REFERENCES invoices(invoice_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  service_period_start DATE NOT NULL,
  service_period_end DATE NOT NULL,
  line_type VARCHAR(30) NOT NULL CHECK (line_type IN ('recurring', 'usage', 'credit', 'tax')),
  revenue_category VARCHAR(40) NOT NULL CHECK (revenue_category IN ('subscription', 'usage', 'professional_services', 'tax', 'credit')),
  billed_amount NUMERIC(14, 2) NOT NULL,
  CHECK (service_period_end > service_period_start)
);

CREATE TABLE revenue_recognition (
  revenue_recognition_id VARCHAR(60) PRIMARY KEY,
  invoice_line_id VARCHAR(50) NOT NULL REFERENCES invoice_lines(invoice_line_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  recognition_month DATE NOT NULL,
  revenue_category VARCHAR(40) NOT NULL CHECK (revenue_category IN ('subscription', 'usage', 'professional_services', 'credit')),
  accounting_basis VARCHAR(30) NOT NULL CHECK (accounting_basis IN ('ratable', 'point_in_time', 'credit')),
  recognized_revenue_amount NUMERIC(14, 2) NOT NULL
);

CREATE TABLE entitlement_intervals (
  entitlement_interval_id VARCHAR(60) PRIMARY KEY,
  plan_id VARCHAR(30) NOT NULL REFERENCES product_plans(plan_id),
  feature_key VARCHAR(40) NOT NULL REFERENCES product_features(feature_key),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  entitlement_status VARCHAR(30) NOT NULL CHECK (entitlement_status IN ('included', 'metered', 'disabled')),
  included_limit INTEGER,
  metering_unit VARCHAR(30) NOT NULL,
  enforcement_mode VARCHAR(30) NOT NULL CHECK (enforcement_mode IN ('hard_limit', 'soft_limit', 'none')),
  CHECK (valid_to > valid_from),
  CHECK (included_limit IS NULL OR included_limit >= 0),
  UNIQUE (plan_id, feature_key, valid_from)
);

CREATE TABLE user_activity_days (
  user_activity_day_id VARCHAR(60) PRIMARY KEY,
  activity_date DATE NOT NULL,
  user_id VARCHAR(30) NOT NULL REFERENCES users(user_id),
  workspace_id VARCHAR(30) NOT NULL REFERENCES workspaces(workspace_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  active_seconds INTEGER NOT NULL CHECK (active_seconds >= 0),
  sessions_count INTEGER NOT NULL CHECK (sessions_count >= 0),
  actions_count INTEGER NOT NULL CHECK (actions_count >= 0),
  is_billable_seat_activity BOOLEAN NOT NULL,
  UNIQUE (activity_date, user_id, workspace_id)
);

CREATE TABLE feature_usage_days (
  feature_usage_day_id VARCHAR(70) PRIMARY KEY,
  activity_date DATE NOT NULL,
  user_id VARCHAR(30) NOT NULL REFERENCES users(user_id),
  workspace_id VARCHAR(30) NOT NULL REFERENCES workspaces(workspace_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  plan_id VARCHAR(30) NOT NULL REFERENCES product_plans(plan_id),
  feature_key VARCHAR(40) NOT NULL REFERENCES product_features(feature_key),
  entitlement_interval_id VARCHAR(60) NOT NULL REFERENCES entitlement_intervals(entitlement_interval_id),
  usage_count INTEGER NOT NULL CHECK (usage_count >= 0),
  units_consumed NUMERIC(14, 2) NOT NULL CHECK (units_consumed >= 0),
  feature_used_flag BOOLEAN NOT NULL,
  UNIQUE (activity_date, user_id, workspace_id, feature_key)
);

CREATE TABLE support_cases (
  support_case_id VARCHAR(50) PRIMARY KEY,
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  workspace_id VARCHAR(30) REFERENCES workspaces(workspace_id),
  subscription_id VARCHAR(40) REFERENCES subscriptions(subscription_id),
  opened_at TIMESTAMP NOT NULL,
  first_response_at TIMESTAMP,
  resolved_at TIMESTAMP,
  priority VARCHAR(20) NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  case_status VARCHAR(30) NOT NULL CHECK (case_status IN ('open', 'pending_customer', 'resolved', 'closed')),
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('email', 'chat', 'web', 'phone')),
  category VARCHAR(50) NOT NULL,
  sla_paused_minutes INTEGER NOT NULL CHECK (sla_paused_minutes >= 0),
  csat_score INTEGER CHECK (csat_score BETWEEN 1 AND 5),
  CHECK (first_response_at IS NULL OR first_response_at >= opened_at),
  CHECK (resolved_at IS NULL OR resolved_at >= opened_at)
);

CREATE TABLE incidents (
  incident_id VARCHAR(40) PRIMARY KEY,
  incident_number VARCHAR(40) NOT NULL UNIQUE,
  started_at TIMESTAMP NOT NULL,
  detected_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('sev1', 'sev2', 'sev3', 'sev4')),
  incident_status VARCHAR(30) NOT NULL CHECK (incident_status IN ('investigating', 'monitoring', 'resolved')),
  product_area VARCHAR(50) NOT NULL,
  customer_visible BOOLEAN NOT NULL,
  CHECK (detected_at >= started_at),
  CHECK (resolved_at IS NULL OR resolved_at >= detected_at)
);

CREATE TABLE incident_workspace_impacts (
  incident_impact_id VARCHAR(60) PRIMARY KEY,
  incident_id VARCHAR(40) NOT NULL REFERENCES incidents(incident_id),
  workspace_id VARCHAR(30) NOT NULL REFERENCES workspaces(workspace_id),
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  impact_start_at TIMESTAMP NOT NULL,
  impact_end_at TIMESTAMP NOT NULL,
  impact_minutes INTEGER NOT NULL CHECK (impact_minutes >= 0),
  impact_type VARCHAR(40) NOT NULL CHECK (impact_type IN ('degraded_performance', 'partial_outage', 'full_outage')),
  CHECK (impact_end_at >= impact_start_at)
);

CREATE TABLE renewals (
  renewal_id VARCHAR(50) PRIMARY KEY,
  account_id VARCHAR(30) NOT NULL REFERENCES accounts(account_id),
  subscription_id VARCHAR(40) NOT NULL REFERENCES subscriptions(subscription_id),
  current_contract_id VARCHAR(40) NOT NULL REFERENCES contracts(contract_id),
  next_contract_id VARCHAR(40) REFERENCES contracts(contract_id),
  renewal_due_date DATE NOT NULL,
  renewal_stage VARCHAR(30) NOT NULL CHECK (renewal_stage IN ('not_started', 'discovery', 'negotiation', 'committed', 'closed_won', 'closed_lost')),
  forecast_category VARCHAR(30) NOT NULL CHECK (forecast_category IN ('pipeline', 'best_case', 'commit', 'closed')),
  renewal_arr NUMERIC(14, 2) NOT NULL CHECK (renewal_arr >= 0),
  expansion_arr_forecast NUMERIC(14, 2) NOT NULL CHECK (expansion_arr_forecast >= 0),
  contraction_arr_risk NUMERIC(14, 2) NOT NULL CHECK (contraction_arr_risk >= 0),
  churn_risk_reason VARCHAR(120),
  closed_at TIMESTAMP,
  CHECK (closed_at IS NULL OR renewal_stage IN ('closed_won', 'closed_lost'))
);
