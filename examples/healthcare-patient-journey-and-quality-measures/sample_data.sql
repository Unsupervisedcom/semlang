INSERT INTO patients (
  patient_id, medical_record_number, birth_date, sex_at_birth,
  race_ethnicity, deceased_at
) VALUES
  ('PAT_1001', 'MRN-1001', DATE '1958-04-18', 'female', 'Hispanic or Latino', NULL),
  ('PAT_1002', 'MRN-1002', DATE '1972-11-03', 'male', 'White', NULL),
  ('PAT_1003', 'MRN-1003', DATE '1944-02-22', 'female', 'Black or African American', TIMESTAMP '2025-02-04 19:30:00'),
  ('PAT_1004', 'MRN-1004', DATE '1985-09-15', 'male', 'Asian', NULL),
  ('PAT_1005', 'MRN-1005', DATE '1966-07-29', 'female', 'American Indian or Alaska Native', NULL);

INSERT INTO facilities (
  facility_id, facility_code, facility_name, facility_type, region, market,
  opened_date, closed_date
) VALUES
  ('FAC_DEN', 'DEN-MED', 'Denver Medical Center', 'acute_care_hospital', 'Mountain', 'Denver', DATE '1998-06-01', NULL),
  ('FAC_AUR', 'AUR-COMM', 'Aurora Community Hospital', 'acute_care_hospital', 'Mountain', 'Denver', DATE '2008-09-15', NULL),
  ('FAC_WEST', 'WEST-CLIN', 'Westside Ambulatory Clinic', 'ambulatory_clinic', 'Mountain', 'Denver', DATE '2016-03-20', NULL);

INSERT INTO providers (
  provider_id, npi, provider_name, provider_type, specialty, active_from, active_to
) VALUES
  ('PROV_CARD_01', '1003000001', 'Avery Chen, MD', 'physician', 'Cardiology', DATE '2017-01-01', NULL),
  ('PROV_HOSP_01', '1003000002', 'Mountain Hospitalists', 'hospitalist_group', 'Hospital Medicine', DATE '2019-01-01', NULL),
  ('PROV_ENDO_01', '1003000003', 'Samira Patel, NP', 'advanced_practice_provider', 'Endocrinology', DATE '2021-05-15', NULL),
  ('PROV_PCP_01', '1003000004', 'Jordan Miles, MD', 'physician', 'Internal Medicine', DATE '2015-04-01', NULL);

INSERT INTO encounters (
  encounter_id, patient_id, facility_id, attending_provider_id, encounter_type,
  admit_at, discharge_at, service_line, discharge_disposition, encounter_reason
) VALUES
  ('ENC_5001', 'PAT_1001', 'FAC_DEN', 'PROV_CARD_01', 'inpatient', TIMESTAMP '2025-01-01 09:20:00', TIMESTAMP '2025-01-05 14:00:00', 'Cardiology', 'home', 'Heart failure exacerbation'),
  ('ENC_5002', 'PAT_1001', 'FAC_AUR', 'PROV_HOSP_01', 'inpatient', TIMESTAMP '2025-01-20 03:15:00', TIMESTAMP '2025-01-23 11:45:00', 'Medicine', 'home_health', 'Shortness of breath'),
  ('ENC_5003', 'PAT_1002', 'FAC_DEN', 'PROV_HOSP_01', 'inpatient', TIMESTAMP '2025-01-10 07:00:00', TIMESTAMP '2025-01-12 10:10:00', 'Orthopedics', 'home', 'Scheduled joint replacement'),
  ('ENC_5004', 'PAT_1003', 'FAC_DEN', 'PROV_HOSP_01', 'inpatient', TIMESTAMP '2025-02-01 18:40:00', TIMESTAMP '2025-02-04 19:30:00', 'Medicine', 'expired', 'Sepsis'),
  ('ENC_5005', 'PAT_1004', 'FAC_WEST', 'PROV_PCP_01', 'outpatient', TIMESTAMP '2025-02-11 09:00:00', TIMESTAMP '2025-02-11 09:40:00', 'Primary Care', 'home', 'Diabetes follow-up'),
  ('ENC_5006', 'PAT_1005', 'FAC_DEN', 'PROV_HOSP_01', 'inpatient', TIMESTAMP '2025-03-02 12:10:00', TIMESTAMP '2025-03-06 13:25:00', 'Medicine', 'skilled_nursing_facility', 'Pneumonia'),
  ('ENC_5007', 'PAT_1005', 'FAC_DEN', 'PROV_HOSP_01', 'emergency', TIMESTAMP '2025-03-15 21:50:00', TIMESTAMP '2025-03-16 02:05:00', 'Emergency Medicine', 'home', 'Medication reaction'),
  ('ENC_5008', 'PAT_1002', 'FAC_WEST', 'PROV_ENDO_01', 'outpatient', TIMESTAMP '2025-03-20 10:30:00', TIMESTAMP '2025-03-20 11:05:00', 'Endocrinology', 'home', 'Diabetes management');

INSERT INTO inpatient_stays (
  stay_id, encounter_id, patient_id, facility_id, attending_provider_id,
  admit_at, discharge_at, discharge_date, length_of_stay_days, service_line,
  discharge_disposition, index_stay_eligible_flag, planned_admission_flag,
  mortality_exclusion_flag
) VALUES
  ('STAY_7001', 'ENC_5001', 'PAT_1001', 'FAC_DEN', 'PROV_CARD_01', TIMESTAMP '2025-01-01 09:20:00', TIMESTAMP '2025-01-05 14:00:00', DATE '2025-01-05', 4.19, 'Cardiology', 'home', TRUE, FALSE, FALSE),
  ('STAY_7002', 'ENC_5002', 'PAT_1001', 'FAC_AUR', 'PROV_HOSP_01', TIMESTAMP '2025-01-20 03:15:00', TIMESTAMP '2025-01-23 11:45:00', DATE '2025-01-23', 3.35, 'Medicine', 'home_health', TRUE, FALSE, FALSE),
  ('STAY_7003', 'ENC_5003', 'PAT_1002', 'FAC_DEN', 'PROV_HOSP_01', TIMESTAMP '2025-01-10 07:00:00', TIMESTAMP '2025-01-12 10:10:00', DATE '2025-01-12', 2.13, 'Orthopedics', 'home', FALSE, TRUE, FALSE),
  ('STAY_7004', 'ENC_5004', 'PAT_1003', 'FAC_DEN', 'PROV_HOSP_01', TIMESTAMP '2025-02-01 18:40:00', TIMESTAMP '2025-02-04 19:30:00', DATE '2025-02-04', 3.03, 'Medicine', 'expired', FALSE, FALSE, TRUE),
  ('STAY_7005', 'ENC_5006', 'PAT_1005', 'FAC_DEN', 'PROV_HOSP_01', TIMESTAMP '2025-03-02 12:10:00', TIMESTAMP '2025-03-06 13:25:00', DATE '2025-03-06', 4.05, 'Medicine', 'skilled_nursing_facility', TRUE, FALSE, FALSE);

INSERT INTO diagnosis_intervals (
  diagnosis_interval_id, patient_id, encounter_id, diagnosis_code,
  diagnosis_system, diagnosis_description, clinical_valid_start,
  clinical_valid_end, recorded_at, source_system, present_on_admission_flag
) VALUES
  ('DX_9001', 'PAT_1001', 'ENC_5001', 'I50.23', 'ICD-10-CM', 'Acute on chronic systolic heart failure', DATE '2025-01-01', DATE '9999-12-31', TIMESTAMP '2025-01-02 08:00:00', 'encounter_coding', TRUE),
  ('DX_9002', 'PAT_1001', 'ENC_5002', 'J18.9', 'ICD-10-CM', 'Pneumonia, unspecified organism', DATE '2025-01-20', DATE '2025-02-15', TIMESTAMP '2025-01-21 10:15:00', 'encounter_coding', TRUE),
  ('DX_9003', 'PAT_1002', NULL, 'E11.9', 'ICD-10-CM', 'Type 2 diabetes mellitus without complications', DATE '2024-06-01', DATE '9999-12-31', TIMESTAMP '2024-06-01 13:30:00', 'ehr_problem_list', NULL),
  ('DX_9004', 'PAT_1003', 'ENC_5004', 'A41.9', 'ICD-10-CM', 'Sepsis, unspecified organism', DATE '2025-02-01', DATE '2025-02-04', TIMESTAMP '2025-02-02 07:50:00', 'encounter_coding', TRUE),
  ('DX_9005', 'PAT_1004', NULL, 'E11.65', 'ICD-10-CM', 'Type 2 diabetes mellitus with hyperglycemia', DATE '2023-09-15', DATE '9999-12-31', TIMESTAMP '2024-01-10 09:00:00', 'ehr_problem_list', NULL),
  ('DX_9006', 'PAT_1005', 'ENC_5006', 'J18.9', 'ICD-10-CM', 'Pneumonia, unspecified organism', DATE '2025-03-02', DATE '2025-03-30', TIMESTAMP '2025-03-03 08:40:00', 'encounter_coding', TRUE);

INSERT INTO lab_results (
  lab_result_id, patient_id, encounter_id, ordering_provider_id, facility_id,
  specimen_collected_at, resulted_at, test_code, test_name, result_value,
  result_unit, reference_low, reference_high, abnormal_flag, turnaround_minutes
) VALUES
  ('LAB_3001', 'PAT_1001', 'ENC_5001', 'PROV_CARD_01', 'FAC_DEN', TIMESTAMP '2025-01-01 10:00:00', TIMESTAMP '2025-01-01 10:45:00', 'BNP', 'B-type natriuretic peptide', 910.000, 'pg/mL', 0.000, 100.000, TRUE, 45),
  ('LAB_3002', 'PAT_1001', 'ENC_5002', 'PROV_HOSP_01', 'FAC_AUR', TIMESTAMP '2025-01-20 04:00:00', TIMESTAMP '2025-01-20 05:10:00', 'CR', 'Creatinine', 1.400, 'mg/dL', 0.600, 1.300, TRUE, 70),
  ('LAB_3003', 'PAT_1002', 'ENC_5008', 'PROV_ENDO_01', 'FAC_WEST', TIMESTAMP '2025-03-20 10:40:00', TIMESTAMP '2025-03-20 16:30:00', 'A1C', 'Hemoglobin A1c', 7.200, 'percent', 4.000, 5.600, TRUE, 350),
  ('LAB_3004', 'PAT_1004', 'ENC_5005', 'PROV_PCP_01', 'FAC_WEST', TIMESTAMP '2025-02-11 09:15:00', TIMESTAMP '2025-02-11 15:45:00', 'A1C', 'Hemoglobin A1c', 8.900, 'percent', 4.000, 5.600, TRUE, 390),
  ('LAB_3005', 'PAT_1005', 'ENC_5006', 'PROV_HOSP_01', 'FAC_DEN', TIMESTAMP '2025-03-02 13:05:00', TIMESTAMP '2025-03-02 13:50:00', 'WBC', 'White blood cell count', 13.400, '10^9/L', 4.000, 11.000, TRUE, 45),
  ('LAB_3006', 'PAT_1005', 'ENC_5007', 'PROV_HOSP_01', 'FAC_DEN', TIMESTAMP '2025-03-15 22:20:00', TIMESTAMP '2025-03-15 23:05:00', 'CR', 'Creatinine', 0.900, 'mg/dL', 0.600, 1.300, FALSE, 45);

INSERT INTO claims (
  claim_id, encounter_id, patient_id, payer_name, claim_type, claim_status,
  billed_amount, allowed_amount, paid_amount, denied_amount,
  claim_submitted_at, claim_paid_at, denial_reason
) VALUES
  ('CLM_8001', 'ENC_5001', 'PAT_1001', 'Front Range Medicare Advantage', 'facility', 'paid', 28400.00, 16400.00, 15480.00, 0.00, TIMESTAMP '2025-01-08 09:00:00', TIMESTAMP '2025-01-19 12:00:00', NULL),
  ('CLM_8002', 'ENC_5002', 'PAT_1001', 'Front Range Medicare Advantage', 'facility', 'partially_paid', 17100.00, 9400.00, 7200.00, 1100.00, TIMESTAMP '2025-01-25 09:15:00', TIMESTAMP '2025-02-10 10:45:00', 'Medical necessity review'),
  ('CLM_8003', 'ENC_5003', 'PAT_1002', 'Peak Commercial', 'facility', 'paid', 22900.00, 13800.00, 13110.00, 0.00, TIMESTAMP '2025-01-14 11:30:00', TIMESTAMP '2025-01-28 15:20:00', NULL),
  ('CLM_8004', 'ENC_5004', 'PAT_1003', 'State Medicaid', 'facility', 'submitted', 31200.00, 0.00, 0.00, 0.00, TIMESTAMP '2025-02-06 08:45:00', NULL, NULL),
  ('CLM_8005', 'ENC_5005', 'PAT_1004', 'Self Pay', 'professional', 'denied', 220.00, 0.00, 0.00, 220.00, TIMESTAMP '2025-02-12 12:15:00', NULL, 'Coverage inactive'),
  ('CLM_8006', 'ENC_5006', 'PAT_1005', 'State Medicaid', 'facility', 'paid', 18600.00, 9700.00, 9700.00, 0.00, TIMESTAMP '2025-03-09 09:00:00', TIMESTAMP '2025-03-25 13:15:00', NULL);

INSERT INTO payer_coverage_intervals (
  coverage_interval_id, patient_id, payer_name, plan_name, payer_type,
  member_id, coverage_start_date, coverage_end_date, is_primary
) VALUES
  ('COV_6001', 'PAT_1001', 'Front Range Medicare Advantage', 'MA Gold', 'medicare', 'MA-1001', DATE '2024-01-01', DATE '2026-01-01', TRUE),
  ('COV_6002', 'PAT_1002', 'Peak Commercial', 'Preferred PPO', 'commercial', 'PC-1002', DATE '2024-06-01', DATE '2025-12-31', TRUE),
  ('COV_6003', 'PAT_1003', 'State Medicaid', 'Standard Medicaid', 'medicaid', 'MD-1003', DATE '2023-01-01', DATE '2025-12-31', TRUE),
  ('COV_6004', 'PAT_1004', 'Peak Commercial', 'Preferred PPO', 'commercial', 'PC-1004', DATE '2024-01-01', DATE '2025-02-01', TRUE),
  ('COV_6005', 'PAT_1004', 'Self Pay', 'Self Pay', 'self_pay', 'SP-1004', DATE '2025-02-01', DATE '2026-01-01', TRUE),
  ('COV_6006', 'PAT_1005', 'State Medicaid', 'Standard Medicaid', 'medicaid', 'MD-1005', DATE '2024-01-01', DATE '2026-01-01', TRUE);

INSERT INTO readmission_events (
  readmission_event_id, index_stay_id, readmission_stay_id, patient_id,
  readmitted_at, days_after_discharge, planned_readmission_flag, same_facility_flag
) VALUES
  ('READMIT_4001', 'STAY_7001', 'STAY_7002', 'PAT_1001', TIMESTAMP '2025-01-20 03:15:00', 15, FALSE, FALSE);

INSERT INTO quality_measure_populations (
  population_member_id, measure_id, measure_version, measure_name,
  measurement_period_start, measurement_period_end, denominator_grain,
  patient_id, stay_id, facility_id, provider_id, denominator_flag,
  numerator_flag, exclusion_flag, exception_flag, exclusion_reason,
  numerator_event_at, source_system
) VALUES
  ('QMP_READM_7001', 'READM_30D', '2025.1', 'Thirty-day unplanned readmission after inpatient discharge', DATE '2025-01-01', DATE '2025-12-31', 'inpatient_discharge', 'PAT_1001', 'STAY_7001', 'FAC_DEN', 'PROV_CARD_01', TRUE, TRUE, FALSE, FALSE, NULL, TIMESTAMP '2025-01-20 03:15:00', 'claims_measure_engine'),
  ('QMP_READM_7002', 'READM_30D', '2025.1', 'Thirty-day unplanned readmission after inpatient discharge', DATE '2025-01-01', DATE '2025-12-31', 'inpatient_discharge', 'PAT_1001', 'STAY_7002', 'FAC_AUR', 'PROV_HOSP_01', TRUE, FALSE, FALSE, FALSE, NULL, NULL, 'claims_measure_engine'),
  ('QMP_READM_7003', 'READM_30D', '2025.1', 'Thirty-day unplanned readmission after inpatient discharge', DATE '2025-01-01', DATE '2025-12-31', 'inpatient_discharge', 'PAT_1002', 'STAY_7003', 'FAC_DEN', 'PROV_HOSP_01', TRUE, FALSE, TRUE, FALSE, 'planned index admission', NULL, 'claims_measure_engine'),
  ('QMP_READM_7004', 'READM_30D', '2025.1', 'Thirty-day unplanned readmission after inpatient discharge', DATE '2025-01-01', DATE '2025-12-31', 'inpatient_discharge', 'PAT_1003', 'STAY_7004', 'FAC_DEN', 'PROV_HOSP_01', TRUE, FALSE, TRUE, FALSE, 'expired during stay', NULL, 'claims_measure_engine'),
  ('QMP_READM_7005', 'READM_30D', '2025.1', 'Thirty-day unplanned readmission after inpatient discharge', DATE '2025-01-01', DATE '2025-12-31', 'inpatient_discharge', 'PAT_1005', 'STAY_7005', 'FAC_DEN', 'PROV_HOSP_01', TRUE, FALSE, FALSE, FALSE, NULL, NULL, 'claims_measure_engine'),
  ('QMP_A1C_1002', 'A1C_CONTROL', '2025.1', 'Diabetes patients with most recent A1c controlled', DATE '2025-01-01', DATE '2025-12-31', 'patient_measure_period', 'PAT_1002', NULL, 'FAC_WEST', 'PROV_ENDO_01', TRUE, TRUE, FALSE, FALSE, NULL, TIMESTAMP '2025-03-20 16:30:00', 'quality_registry'),
  ('QMP_A1C_1004', 'A1C_CONTROL', '2025.1', 'Diabetes patients with most recent A1c controlled', DATE '2025-01-01', DATE '2025-12-31', 'patient_measure_period', 'PAT_1004', NULL, 'FAC_WEST', 'PROV_PCP_01', TRUE, FALSE, FALSE, FALSE, NULL, TIMESTAMP '2025-02-11 15:45:00', 'quality_registry');
