INSERT INTO accounts (
  account_id, account_name, segment, industry, region, billing_country,
  account_owner, created_date
) VALUES
  ('ACCT_ACME', 'Acme Robotics', 'enterprise', 'Manufacturing', 'North America', 'US', 'Maya Stone', DATE '2022-04-12'),
  ('ACCT_NOVA', 'Nova Health', 'mid_market', 'Healthcare', 'North America', 'US', 'Eli Park', DATE '2023-02-01'),
  ('ACCT_PINNACLE', 'Pinnacle Bank', 'enterprise', 'Financial Services', 'EMEA', 'GB', 'Rina Shah', DATE '2021-09-20'),
  ('ACCT_ORBIT', 'Orbit Labs', 'startup', 'Software', 'North America', 'US', 'Theo Kim', DATE '2024-06-14');

INSERT INTO workspaces (
  workspace_id, account_id, workspace_name, workspace_type, created_at, archived_at
) VALUES
  ('WS_ACME_PROD', 'ACCT_ACME', 'Acme Production', 'production', TIMESTAMP '2022-04-15 10:00:00', NULL),
  ('WS_ACME_SANDBOX', 'ACCT_ACME', 'Acme Sandbox', 'sandbox', TIMESTAMP '2022-05-01 10:00:00', NULL),
  ('WS_NOVA_PROD', 'ACCT_NOVA', 'Nova Care Ops', 'production', TIMESTAMP '2023-02-10 09:30:00', NULL),
  ('WS_PINNACLE_PROD', 'ACCT_PINNACLE', 'Pinnacle Treasury', 'production', TIMESTAMP '2021-10-01 08:00:00', NULL),
  ('WS_ORBIT_PROD', 'ACCT_ORBIT', 'Orbit App Team', 'production', TIMESTAMP '2024-06-20 14:15:00', NULL);

INSERT INTO users (
  user_id, workspace_id, account_id, external_user_key, user_role, seat_type,
  created_at, deactivated_at
) VALUES
  ('USR_ACME_001', 'WS_ACME_PROD', 'ACCT_ACME', 'acme-admin-1', 'admin', 'paid', TIMESTAMP '2022-04-15 10:30:00', NULL),
  ('USR_ACME_002', 'WS_ACME_PROD', 'ACCT_ACME', 'acme-builder-2', 'builder', 'paid', TIMESTAMP '2023-01-03 11:00:00', NULL),
  ('USR_ACME_003', 'WS_ACME_SANDBOX', 'ACCT_ACME', 'acme-viewer-3', 'viewer', 'free', TIMESTAMP '2023-07-15 13:00:00', NULL),
  ('USR_NOVA_001', 'WS_NOVA_PROD', 'ACCT_NOVA', 'nova-admin-1', 'admin', 'paid', TIMESTAMP '2023-02-10 10:00:00', NULL),
  ('USR_NOVA_002', 'WS_NOVA_PROD', 'ACCT_NOVA', 'nova-builder-2', 'builder', 'paid', TIMESTAMP '2023-04-08 12:00:00', TIMESTAMP '2025-03-15 17:00:00'),
  ('USR_PIN_001', 'WS_PINNACLE_PROD', 'ACCT_PINNACLE', 'pin-admin-1', 'admin', 'paid', TIMESTAMP '2021-10-01 09:00:00', NULL),
  ('USR_ORBIT_001', 'WS_ORBIT_PROD', 'ACCT_ORBIT', 'orbit-admin-1', 'admin', 'paid', TIMESTAMP '2024-06-20 15:00:00', NULL);

INSERT INTO product_plans (
  plan_id, plan_code, plan_family, billing_interval, base_arr_amount,
  included_seats, created_at
) VALUES
  ('PLAN_TEAM_2024', 'TEAM-2024', 'team', 'annual', 12000.00, 10, TIMESTAMP '2024-01-01 00:00:00'),
  ('PLAN_BUSINESS_2024', 'BUSINESS-2024', 'business', 'annual', 48000.00, 50, TIMESTAMP '2024-01-01 00:00:00'),
  ('PLAN_ENTERPRISE_2024', 'ENT-2024', 'enterprise', 'annual', 120000.00, 200, TIMESTAMP '2024-01-01 00:00:00');

INSERT INTO product_features (
  feature_key, feature_name, feature_family, telemetry_event_name, release_date
) VALUES
  ('FEATURE_DASHBOARDS', 'Dashboards', 'analytics', 'dashboard_viewed', DATE '2021-01-15'),
  ('FEATURE_WORKFLOWS', 'Workflow Automations', 'automation', 'workflow_run', DATE '2022-06-01'),
  ('FEATURE_AI_ASSIST', 'AI Assist', 'intelligence', 'ai_assist_invoked', DATE '2024-09-10'),
  ('FEATURE_AUDIT_LOGS', 'Audit Logs', 'governance', 'audit_log_viewed', DATE '2022-10-01'),
  ('FEATURE_SSO', 'Single Sign-On', 'security', 'sso_login', DATE '2021-08-01');

INSERT INTO subscriptions (
  subscription_id, account_id, plan_id, subscription_state, start_date,
  cancellation_requested_at, churn_effective_date, current_term_start,
  current_term_end, paid_seats, contracted_arr, billing_currency
) VALUES
  ('SUB_ACME_MAIN', 'ACCT_ACME', 'PLAN_ENTERPRISE_2024', 'active', DATE '2022-04-15', NULL, NULL, DATE '2025-04-15', DATE '2026-04-15', 240, 156000.00, 'USD'),
  ('SUB_NOVA_MAIN', 'ACCT_NOVA', 'PLAN_BUSINESS_2024', 'cancel_pending', DATE '2023-02-10', TIMESTAMP '2025-03-05 16:30:00', DATE '2025-04-01', DATE '2024-04-01', DATE '2025-04-01', 55, 54000.00, 'USD'),
  ('SUB_PINNACLE_MAIN', 'ACCT_PINNACLE', 'PLAN_ENTERPRISE_2024', 'active', DATE '2021-10-01', NULL, NULL, DATE '2024-10-01', DATE '2025-10-01', 300, 240000.00, 'GBP'),
  ('SUB_ORBIT_MAIN', 'ACCT_ORBIT', 'PLAN_TEAM_2024', 'active', DATE '2024-06-20', NULL, NULL, DATE '2024-06-20', DATE '2025-06-20', 12, 14400.00, 'USD');

INSERT INTO contracts (
  contract_id, account_id, subscription_id, contract_number, contract_type,
  signed_at, contract_start_date, contract_end_date, booking_arr, prior_arr,
  arr_delta, auto_renewal
) VALUES
  ('CON_ACME_2025', 'ACCT_ACME', 'SUB_ACME_MAIN', 'ACME-2025-001', 'expansion', TIMESTAMP '2025-04-10 15:00:00', DATE '2025-04-15', DATE '2026-04-15', 156000.00, 132000.00, 24000.00, TRUE),
  ('CON_NOVA_2024', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 'NOVA-2024-001', 'renewal', TIMESTAMP '2024-03-22 12:00:00', DATE '2024-04-01', DATE '2025-04-01', 54000.00, 48000.00, 6000.00, FALSE),
  ('CON_PIN_2024', 'ACCT_PINNACLE', 'SUB_PINNACLE_MAIN', 'PIN-2024-001', 'renewal', TIMESTAMP '2024-09-20 10:00:00', DATE '2024-10-01', DATE '2025-10-01', 240000.00, 240000.00, 0.00, TRUE),
  ('CON_ORBIT_2024', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 'ORB-2024-001', 'new', TIMESTAMP '2024-06-18 09:45:00', DATE '2024-06-20', DATE '2025-06-20', 14400.00, 0.00, 14400.00, FALSE),
  ('CON_ORBIT_2025', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 'ORB-2025-001', 'renewal', TIMESTAMP '2025-05-10 10:15:00', DATE '2025-06-20', DATE '2026-06-20', 18000.00, 14400.00, 3600.00, FALSE);

INSERT INTO subscription_periods (
  subscription_period_id, subscription_id, account_id, plan_id, period_start,
  period_end, period_state, paid_seats, starting_arr, ending_arr, arr_delta,
  churn_effective_flag, prior_arr_amount
) VALUES
  ('SP_ACME_2025_01', 'SUB_ACME_MAIN', 'ACCT_ACME', 'PLAN_ENTERPRISE_2024', DATE '2025-01-01', DATE '2025-02-01', 'active', 220, 132000.00, 132000.00, 0.00, FALSE, 132000.00),
  ('SP_ACME_2025_04', 'SUB_ACME_MAIN', 'ACCT_ACME', 'PLAN_ENTERPRISE_2024', DATE '2025-04-01', DATE '2025-05-01', 'active', 240, 132000.00, 156000.00, 24000.00, FALSE, 132000.00),
  ('SP_NOVA_2025_03', 'SUB_NOVA_MAIN', 'ACCT_NOVA', 'PLAN_BUSINESS_2024', DATE '2025-03-01', DATE '2025-04-01', 'cancel_pending', 55, 54000.00, 54000.00, 0.00, FALSE, 54000.00),
  ('SP_NOVA_2025_04', 'SUB_NOVA_MAIN', 'ACCT_NOVA', 'PLAN_BUSINESS_2024', DATE '2025-04-01', DATE '2025-05-01', 'churned', 0, 54000.00, 0.00, -54000.00, TRUE, 54000.00),
  ('SP_PIN_2025_01', 'SUB_PINNACLE_MAIN', 'ACCT_PINNACLE', 'PLAN_ENTERPRISE_2024', DATE '2025-01-01', DATE '2025-02-01', 'active', 300, 240000.00, 240000.00, 0.00, FALSE, 240000.00),
  ('SP_ORBIT_2025_05', 'SUB_ORBIT_MAIN', 'ACCT_ORBIT', 'PLAN_TEAM_2024', DATE '2025-05-01', DATE '2025-06-01', 'active', 12, 14400.00, 14400.00, 0.00, FALSE, 14400.00),
  ('SP_ORBIT_2025_06', 'SUB_ORBIT_MAIN', 'ACCT_ORBIT', 'PLAN_TEAM_2024', DATE '2025-06-01', DATE '2025-07-01', 'active', 15, 14400.00, 18000.00, 3600.00, FALSE, 14400.00);

INSERT INTO invoices (
  invoice_id, account_id, subscription_id, invoice_number, invoice_date,
  due_date, invoice_status, invoice_total, currency
) VALUES
  ('INV_ACME_2025_04', 'ACCT_ACME', 'SUB_ACME_MAIN', 'INV-ACME-2025-04', DATE '2025-04-15', DATE '2025-05-15', 'paid', 39000.00, 'USD'),
  ('INV_NOVA_2025_03', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 'INV-NOVA-2025-03', DATE '2025-03-01', DATE '2025-03-31', 'paid', 4500.00, 'USD'),
  ('INV_NOVA_2025_04_CREDIT', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 'INV-NOVA-2025-04-C', DATE '2025-04-01', DATE '2025-04-01', 'paid', -4500.00, 'USD'),
  ('INV_PIN_2025_01', 'ACCT_PINNACLE', 'SUB_PINNACLE_MAIN', 'INV-PIN-2025-01', DATE '2025-01-01', DATE '2025-01-31', 'paid', 20000.00, 'GBP'),
  ('INV_ORBIT_2025_06', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 'INV-ORB-2025-06', DATE '2025-06-20', DATE '2025-07-20', 'open', 18000.00, 'USD');

INSERT INTO invoice_lines (
  invoice_line_id, invoice_id, subscription_id, account_id, service_period_start,
  service_period_end, line_type, revenue_category, billed_amount
) VALUES
  ('IL_ACME_2025_Q2_SUB', 'INV_ACME_2025_04', 'SUB_ACME_MAIN', 'ACCT_ACME', DATE '2025-04-15', DATE '2025-07-15', 'recurring', 'subscription', 39000.00),
  ('IL_NOVA_2025_03_SUB', 'INV_NOVA_2025_03', 'SUB_NOVA_MAIN', 'ACCT_NOVA', DATE '2025-03-01', DATE '2025-04-01', 'recurring', 'subscription', 4500.00),
  ('IL_NOVA_2025_04_CREDIT', 'INV_NOVA_2025_04_CREDIT', 'SUB_NOVA_MAIN', 'ACCT_NOVA', DATE '2025-04-01', DATE '2025-05-01', 'credit', 'credit', -4500.00),
  ('IL_PIN_2025_01_SUB', 'INV_PIN_2025_01', 'SUB_PINNACLE_MAIN', 'ACCT_PINNACLE', DATE '2025-01-01', DATE '2025-02-01', 'recurring', 'subscription', 20000.00),
  ('IL_ORBIT_2025_06_SUB', 'INV_ORBIT_2025_06', 'SUB_ORBIT_MAIN', 'ACCT_ORBIT', DATE '2025-06-20', DATE '2026-06-20', 'recurring', 'subscription', 18000.00);

INSERT INTO revenue_recognition (
  revenue_recognition_id, invoice_line_id, account_id, subscription_id,
  recognition_month, revenue_category, accounting_basis, recognized_revenue_amount
) VALUES
  ('RR_ACME_2025_04', 'IL_ACME_2025_Q2_SUB', 'ACCT_ACME', 'SUB_ACME_MAIN', DATE '2025-04-01', 'subscription', 'ratable', 13000.00),
  ('RR_ACME_2025_05', 'IL_ACME_2025_Q2_SUB', 'ACCT_ACME', 'SUB_ACME_MAIN', DATE '2025-05-01', 'subscription', 'ratable', 13000.00),
  ('RR_ACME_2025_06', 'IL_ACME_2025_Q2_SUB', 'ACCT_ACME', 'SUB_ACME_MAIN', DATE '2025-06-01', 'subscription', 'ratable', 13000.00),
  ('RR_NOVA_2025_03', 'IL_NOVA_2025_03_SUB', 'ACCT_NOVA', 'SUB_NOVA_MAIN', DATE '2025-03-01', 'subscription', 'ratable', 4500.00),
  ('RR_NOVA_2025_04_CREDIT', 'IL_NOVA_2025_04_CREDIT', 'ACCT_NOVA', 'SUB_NOVA_MAIN', DATE '2025-04-01', 'credit', 'credit', -4500.00),
  ('RR_PIN_2025_01', 'IL_PIN_2025_01_SUB', 'ACCT_PINNACLE', 'SUB_PINNACLE_MAIN', DATE '2025-01-01', 'subscription', 'ratable', 20000.00),
  ('RR_ORBIT_2025_06', 'IL_ORBIT_2025_06_SUB', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', DATE '2025-06-01', 'subscription', 'ratable', 1500.00);

INSERT INTO entitlement_intervals (
  entitlement_interval_id, plan_id, feature_key, valid_from, valid_to,
  entitlement_status, included_limit, metering_unit, enforcement_mode
) VALUES
  ('ENT_TEAM_DASH_2024', 'PLAN_TEAM_2024', 'FEATURE_DASHBOARDS', DATE '2024-01-01', DATE '9999-12-31', 'included', NULL, 'views', 'none'),
  ('ENT_TEAM_AI_2024', 'PLAN_TEAM_2024', 'FEATURE_AI_ASSIST', DATE '2024-09-10', DATE '2025-06-01', 'disabled', 0, 'invocations', 'hard_limit'),
  ('ENT_TEAM_AI_2025', 'PLAN_TEAM_2024', 'FEATURE_AI_ASSIST', DATE '2025-06-01', DATE '9999-12-31', 'metered', 100, 'invocations', 'soft_limit'),
  ('ENT_BUS_WORKFLOW_2024', 'PLAN_BUSINESS_2024', 'FEATURE_WORKFLOWS', DATE '2024-01-01', DATE '9999-12-31', 'included', 5000, 'runs', 'soft_limit'),
  ('ENT_BUS_AI_2024', 'PLAN_BUSINESS_2024', 'FEATURE_AI_ASSIST', DATE '2024-09-10', DATE '9999-12-31', 'metered', 1000, 'invocations', 'soft_limit'),
  ('ENT_ENT_AUDIT_2024', 'PLAN_ENTERPRISE_2024', 'FEATURE_AUDIT_LOGS', DATE '2024-01-01', DATE '9999-12-31', 'included', NULL, 'views', 'none'),
  ('ENT_ENT_SSO_2024', 'PLAN_ENTERPRISE_2024', 'FEATURE_SSO', DATE '2024-01-01', DATE '9999-12-31', 'included', NULL, 'logins', 'none'),
  ('ENT_ENT_AI_2024', 'PLAN_ENTERPRISE_2024', 'FEATURE_AI_ASSIST', DATE '2024-09-10', DATE '9999-12-31', 'included', NULL, 'invocations', 'none');

INSERT INTO user_activity_days (
  user_activity_day_id, activity_date, user_id, workspace_id, account_id,
  subscription_id, active_seconds, sessions_count, actions_count,
  is_billable_seat_activity
) VALUES
  ('UAD_ACME_001_2025_04_18', DATE '2025-04-18', 'USR_ACME_001', 'WS_ACME_PROD', 'ACCT_ACME', 'SUB_ACME_MAIN', 5400, 4, 96, TRUE),
  ('UAD_ACME_002_2025_04_18', DATE '2025-04-18', 'USR_ACME_002', 'WS_ACME_PROD', 'ACCT_ACME', 'SUB_ACME_MAIN', 3600, 3, 72, TRUE),
  ('UAD_ACME_003_2025_04_18', DATE '2025-04-18', 'USR_ACME_003', 'WS_ACME_SANDBOX', 'ACCT_ACME', 'SUB_ACME_MAIN', 900, 1, 12, FALSE),
  ('UAD_NOVA_001_2025_03_20', DATE '2025-03-20', 'USR_NOVA_001', 'WS_NOVA_PROD', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 4200, 3, 54, TRUE),
  ('UAD_NOVA_002_2025_03_12', DATE '2025-03-12', 'USR_NOVA_002', 'WS_NOVA_PROD', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 1800, 2, 30, TRUE),
  ('UAD_PIN_001_2025_01_15', DATE '2025-01-15', 'USR_PIN_001', 'WS_PINNACLE_PROD', 'ACCT_PINNACLE', 'SUB_PINNACLE_MAIN', 6300, 5, 130, TRUE),
  ('UAD_ORBIT_001_2025_06_22', DATE '2025-06-22', 'USR_ORBIT_001', 'WS_ORBIT_PROD', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 3000, 2, 48, TRUE);

INSERT INTO feature_usage_days (
  feature_usage_day_id, activity_date, user_id, workspace_id, account_id,
  subscription_id, plan_id, feature_key, entitlement_interval_id, usage_count,
  units_consumed, feature_used_flag
) VALUES
  ('FUD_ACME_AI_2025_04_18', DATE '2025-04-18', 'USR_ACME_001', 'WS_ACME_PROD', 'ACCT_ACME', 'SUB_ACME_MAIN', 'PLAN_ENTERPRISE_2024', 'FEATURE_AI_ASSIST', 'ENT_ENT_AI_2024', 18, 18.00, TRUE),
  ('FUD_ACME_AUDIT_2025_04_18', DATE '2025-04-18', 'USR_ACME_002', 'WS_ACME_PROD', 'ACCT_ACME', 'SUB_ACME_MAIN', 'PLAN_ENTERPRISE_2024', 'FEATURE_AUDIT_LOGS', 'ENT_ENT_AUDIT_2024', 6, 6.00, TRUE),
  ('FUD_NOVA_WORKFLOW_2025_03_20', DATE '2025-03-20', 'USR_NOVA_001', 'WS_NOVA_PROD', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 'PLAN_BUSINESS_2024', 'FEATURE_WORKFLOWS', 'ENT_BUS_WORKFLOW_2024', 240, 240.00, TRUE),
  ('FUD_NOVA_AI_2025_03_20', DATE '2025-03-20', 'USR_NOVA_001', 'WS_NOVA_PROD', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 'PLAN_BUSINESS_2024', 'FEATURE_AI_ASSIST', 'ENT_BUS_AI_2024', 22, 22.00, TRUE),
  ('FUD_PIN_SSO_2025_01_15', DATE '2025-01-15', 'USR_PIN_001', 'WS_PINNACLE_PROD', 'ACCT_PINNACLE', 'SUB_PINNACLE_MAIN', 'PLAN_ENTERPRISE_2024', 'FEATURE_SSO', 'ENT_ENT_SSO_2024', 55, 55.00, TRUE),
  ('FUD_ORBIT_AI_2025_06_22', DATE '2025-06-22', 'USR_ORBIT_001', 'WS_ORBIT_PROD', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 'PLAN_TEAM_2024', 'FEATURE_AI_ASSIST', 'ENT_TEAM_AI_2025', 12, 12.00, TRUE),
  ('FUD_ORBIT_DASH_2025_05_20', DATE '2025-05-20', 'USR_ORBIT_001', 'WS_ORBIT_PROD', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 'PLAN_TEAM_2024', 'FEATURE_DASHBOARDS', 'ENT_TEAM_DASH_2024', 8, 8.00, TRUE);

INSERT INTO support_cases (
  support_case_id, account_id, workspace_id, subscription_id, opened_at,
  first_response_at, resolved_at, priority, case_status, channel, category,
  sla_paused_minutes, csat_score
) VALUES
  ('CASE_ACME_1001', 'ACCT_ACME', 'WS_ACME_PROD', 'SUB_ACME_MAIN', TIMESTAMP '2025-04-19 08:30:00', TIMESTAMP '2025-04-19 08:42:00', TIMESTAMP '2025-04-19 12:10:00', 'high', 'resolved', 'chat', 'workflow_error', 20, 4),
  ('CASE_NOVA_1001', 'ACCT_NOVA', 'WS_NOVA_PROD', 'SUB_NOVA_MAIN', TIMESTAMP '2025-03-06 09:00:00', TIMESTAMP '2025-03-06 11:15:00', NULL, 'normal', 'pending_customer', 'email', 'billing_question', 0, NULL),
  ('CASE_PIN_1001', 'ACCT_PINNACLE', 'WS_PINNACLE_PROD', 'SUB_PINNACLE_MAIN', TIMESTAMP '2025-01-16 14:20:00', TIMESTAMP '2025-01-16 14:28:00', TIMESTAMP '2025-01-16 16:00:00', 'urgent', 'closed', 'phone', 'sso_outage', 10, 5),
  ('CASE_ORBIT_1001', 'ACCT_ORBIT', 'WS_ORBIT_PROD', 'SUB_ORBIT_MAIN', TIMESTAMP '2025-06-23 10:10:00', TIMESTAMP '2025-06-23 12:00:00', TIMESTAMP '2025-06-24 09:30:00', 'low', 'resolved', 'web', 'feature_request', 0, 3);

INSERT INTO incidents (
  incident_id, incident_number, started_at, detected_at, resolved_at, severity,
  incident_status, product_area, customer_visible
) VALUES
  ('INC_2025_001', 'INC-2025-001', TIMESTAMP '2025-01-15 13:40:00', TIMESTAMP '2025-01-15 13:45:00', TIMESTAMP '2025-01-15 15:05:00', 'sev2', 'resolved', 'authentication', TRUE),
  ('INC_2025_014', 'INC-2025-014', TIMESTAMP '2025-04-18 17:10:00', TIMESTAMP '2025-04-18 17:25:00', TIMESTAMP '2025-04-18 18:00:00', 'sev3', 'resolved', 'automation', TRUE),
  ('INC_2025_022', 'INC-2025-022', TIMESTAMP '2025-06-22 09:00:00', TIMESTAMP '2025-06-22 09:05:00', NULL, 'sev4', 'monitoring', 'analytics', FALSE);

INSERT INTO incident_workspace_impacts (
  incident_impact_id, incident_id, workspace_id, account_id, impact_start_at,
  impact_end_at, impact_minutes, impact_type
) VALUES
  ('IWI_PIN_2025_001', 'INC_2025_001', 'WS_PINNACLE_PROD', 'ACCT_PINNACLE', TIMESTAMP '2025-01-15 13:45:00', TIMESTAMP '2025-01-15 15:05:00', 80, 'partial_outage'),
  ('IWI_ACME_2025_014', 'INC_2025_014', 'WS_ACME_PROD', 'ACCT_ACME', TIMESTAMP '2025-04-18 17:25:00', TIMESTAMP '2025-04-18 18:00:00', 35, 'degraded_performance'),
  ('IWI_ORBIT_2025_022', 'INC_2025_022', 'WS_ORBIT_PROD', 'ACCT_ORBIT', TIMESTAMP '2025-06-22 09:05:00', TIMESTAMP '2025-06-22 09:40:00', 35, 'degraded_performance');

INSERT INTO renewals (
  renewal_id, account_id, subscription_id, current_contract_id, next_contract_id,
  renewal_due_date, renewal_stage, forecast_category, renewal_arr,
  expansion_arr_forecast, contraction_arr_risk, churn_risk_reason, closed_at
) VALUES
  ('REN_ACME_2026', 'ACCT_ACME', 'SUB_ACME_MAIN', 'CON_ACME_2025', NULL, DATE '2026-04-15', 'discovery', 'pipeline', 156000.00, 30000.00, 0.00, NULL, NULL),
  ('REN_NOVA_2025', 'ACCT_NOVA', 'SUB_NOVA_MAIN', 'CON_NOVA_2024', NULL, DATE '2025-04-01', 'closed_lost', 'closed', 54000.00, 0.00, 54000.00, 'executive sponsor left', TIMESTAMP '2025-03-28 17:00:00'),
  ('REN_PIN_2025', 'ACCT_PINNACLE', 'SUB_PINNACLE_MAIN', 'CON_PIN_2024', NULL, DATE '2025-10-01', 'negotiation', 'commit', 240000.00, 60000.00, 0.00, NULL, NULL),
  ('REN_ORBIT_2025', 'ACCT_ORBIT', 'SUB_ORBIT_MAIN', 'CON_ORBIT_2024', 'CON_ORBIT_2025', DATE '2025-06-20', 'closed_won', 'closed', 14400.00, 3600.00, 0.00, NULL, TIMESTAMP '2025-05-10 10:15:00');
