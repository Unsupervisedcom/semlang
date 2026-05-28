CREATE TABLE patients (
  patient_id VARCHAR(30) PRIMARY KEY,
  medical_record_number VARCHAR(40) NOT NULL UNIQUE,
  birth_date DATE NOT NULL,
  sex_at_birth VARCHAR(20) NOT NULL CHECK (sex_at_birth IN ('female', 'male', 'intersex', 'unknown')),
  race_ethnicity VARCHAR(80) NOT NULL,
  deceased_at TIMESTAMP
);

CREATE TABLE facilities (
  facility_id VARCHAR(30) PRIMARY KEY,
  facility_code VARCHAR(20) NOT NULL UNIQUE,
  facility_name VARCHAR(120) NOT NULL,
  facility_type VARCHAR(40) NOT NULL CHECK (facility_type IN ('acute_care_hospital', 'critical_access_hospital', 'ambulatory_clinic')),
  region VARCHAR(60) NOT NULL,
  market VARCHAR(60) NOT NULL,
  opened_date DATE NOT NULL,
  closed_date DATE,
  CHECK (closed_date IS NULL OR closed_date >= opened_date)
);

CREATE TABLE providers (
  provider_id VARCHAR(30) PRIMARY KEY,
  npi VARCHAR(20) NOT NULL UNIQUE,
  provider_name VARCHAR(120) NOT NULL,
  provider_type VARCHAR(40) NOT NULL CHECK (provider_type IN ('physician', 'advanced_practice_provider', 'hospitalist_group')),
  specialty VARCHAR(80) NOT NULL,
  active_from DATE NOT NULL,
  active_to DATE,
  CHECK (active_to IS NULL OR active_to >= active_from)
);

CREATE TABLE encounters (
  encounter_id VARCHAR(40) PRIMARY KEY,
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  facility_id VARCHAR(30) NOT NULL REFERENCES facilities(facility_id),
  attending_provider_id VARCHAR(30) NOT NULL REFERENCES providers(provider_id),
  encounter_type VARCHAR(30) NOT NULL CHECK (encounter_type IN ('inpatient', 'emergency', 'observation', 'outpatient')),
  admit_at TIMESTAMP NOT NULL,
  discharge_at TIMESTAMP,
  service_line VARCHAR(80) NOT NULL,
  discharge_disposition VARCHAR(60),
  encounter_reason VARCHAR(120) NOT NULL,
  CHECK (discharge_at IS NULL OR discharge_at >= admit_at)
);

CREATE TABLE inpatient_stays (
  stay_id VARCHAR(40) PRIMARY KEY,
  encounter_id VARCHAR(40) NOT NULL UNIQUE REFERENCES encounters(encounter_id),
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  facility_id VARCHAR(30) NOT NULL REFERENCES facilities(facility_id),
  attending_provider_id VARCHAR(30) NOT NULL REFERENCES providers(provider_id),
  admit_at TIMESTAMP NOT NULL,
  discharge_at TIMESTAMP NOT NULL,
  discharge_date DATE NOT NULL,
  length_of_stay_days NUMERIC(6, 2) NOT NULL CHECK (length_of_stay_days >= 0),
  service_line VARCHAR(80) NOT NULL,
  discharge_disposition VARCHAR(60) NOT NULL,
  index_stay_eligible_flag BOOLEAN NOT NULL,
  planned_admission_flag BOOLEAN NOT NULL,
  mortality_exclusion_flag BOOLEAN NOT NULL,
  CHECK (discharge_at >= admit_at)
);

CREATE TABLE diagnosis_intervals (
  diagnosis_interval_id VARCHAR(50) PRIMARY KEY,
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  encounter_id VARCHAR(40) REFERENCES encounters(encounter_id),
  diagnosis_code VARCHAR(20) NOT NULL,
  diagnosis_system VARCHAR(20) NOT NULL CHECK (diagnosis_system IN ('ICD-10-CM', 'SNOMED-CT')),
  diagnosis_description VARCHAR(160) NOT NULL,
  clinical_valid_start DATE NOT NULL,
  clinical_valid_end DATE NOT NULL,
  recorded_at TIMESTAMP NOT NULL,
  source_system VARCHAR(30) NOT NULL CHECK (source_system IN ('ehr_problem_list', 'encounter_coding', 'claims')),
  present_on_admission_flag BOOLEAN,
  CHECK (clinical_valid_end > clinical_valid_start)
);

CREATE TABLE lab_results (
  lab_result_id VARCHAR(50) PRIMARY KEY,
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  encounter_id VARCHAR(40) REFERENCES encounters(encounter_id),
  ordering_provider_id VARCHAR(30) NOT NULL REFERENCES providers(provider_id),
  facility_id VARCHAR(30) NOT NULL REFERENCES facilities(facility_id),
  specimen_collected_at TIMESTAMP NOT NULL,
  resulted_at TIMESTAMP NOT NULL,
  test_code VARCHAR(30) NOT NULL,
  test_name VARCHAR(120) NOT NULL,
  result_value NUMERIC(12, 3) NOT NULL,
  result_unit VARCHAR(40) NOT NULL,
  reference_low NUMERIC(12, 3),
  reference_high NUMERIC(12, 3),
  abnormal_flag BOOLEAN NOT NULL,
  turnaround_minutes INTEGER NOT NULL CHECK (turnaround_minutes >= 0),
  CHECK (resulted_at >= specimen_collected_at)
);

CREATE TABLE claims (
  claim_id VARCHAR(50) PRIMARY KEY,
  encounter_id VARCHAR(40) NOT NULL REFERENCES encounters(encounter_id),
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  payer_name VARCHAR(120) NOT NULL,
  claim_type VARCHAR(30) NOT NULL CHECK (claim_type IN ('facility', 'professional')),
  claim_status VARCHAR(30) NOT NULL CHECK (claim_status IN ('submitted', 'paid', 'partially_paid', 'denied')),
  billed_amount NUMERIC(14, 2) NOT NULL CHECK (billed_amount >= 0),
  allowed_amount NUMERIC(14, 2) NOT NULL CHECK (allowed_amount >= 0),
  paid_amount NUMERIC(14, 2) NOT NULL CHECK (paid_amount >= 0),
  denied_amount NUMERIC(14, 2) NOT NULL CHECK (denied_amount >= 0),
  claim_submitted_at TIMESTAMP NOT NULL,
  claim_paid_at TIMESTAMP,
  denial_reason VARCHAR(120),
  CHECK (
    (claim_status IN ('paid', 'partially_paid') AND claim_paid_at IS NOT NULL)
    OR claim_status IN ('submitted', 'denied')
  )
);

CREATE TABLE payer_coverage_intervals (
  coverage_interval_id VARCHAR(50) PRIMARY KEY,
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  payer_name VARCHAR(120) NOT NULL,
  plan_name VARCHAR(120) NOT NULL,
  payer_type VARCHAR(40) NOT NULL CHECK (payer_type IN ('commercial', 'medicare', 'medicaid', 'self_pay')),
  member_id VARCHAR(60) NOT NULL,
  coverage_start_date DATE NOT NULL,
  coverage_end_date DATE NOT NULL,
  is_primary BOOLEAN NOT NULL,
  CHECK (coverage_end_date > coverage_start_date)
);

CREATE TABLE readmission_events (
  readmission_event_id VARCHAR(50) PRIMARY KEY,
  index_stay_id VARCHAR(40) NOT NULL REFERENCES inpatient_stays(stay_id),
  readmission_stay_id VARCHAR(40) NOT NULL REFERENCES inpatient_stays(stay_id),
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  readmitted_at TIMESTAMP NOT NULL,
  days_after_discharge INTEGER NOT NULL CHECK (days_after_discharge BETWEEN 0 AND 30),
  planned_readmission_flag BOOLEAN NOT NULL,
  same_facility_flag BOOLEAN NOT NULL,
  CHECK (index_stay_id <> readmission_stay_id)
);

CREATE TABLE quality_measure_populations (
  population_member_id VARCHAR(60) PRIMARY KEY,
  measure_id VARCHAR(40) NOT NULL,
  measure_version VARCHAR(30) NOT NULL,
  measure_name VARCHAR(160) NOT NULL,
  measurement_period_start DATE NOT NULL,
  measurement_period_end DATE NOT NULL,
  denominator_grain VARCHAR(40) NOT NULL CHECK (denominator_grain IN ('inpatient_discharge', 'patient_measure_period')),
  patient_id VARCHAR(30) NOT NULL REFERENCES patients(patient_id),
  stay_id VARCHAR(40) REFERENCES inpatient_stays(stay_id),
  facility_id VARCHAR(30) NOT NULL REFERENCES facilities(facility_id),
  provider_id VARCHAR(30) NOT NULL REFERENCES providers(provider_id),
  denominator_flag BOOLEAN NOT NULL,
  numerator_flag BOOLEAN NOT NULL,
  exclusion_flag BOOLEAN NOT NULL,
  exception_flag BOOLEAN NOT NULL,
  exclusion_reason VARCHAR(160),
  numerator_event_at TIMESTAMP,
  source_system VARCHAR(40) NOT NULL CHECK (source_system IN ('quality_registry', 'ehr_abstraction', 'claims_measure_engine')),
  CHECK (measurement_period_end > measurement_period_start),
  CHECK (
    denominator_grain = 'patient_measure_period'
    OR stay_id IS NOT NULL
  )
);
