# Healthcare Patient Journey and Quality Measures

This package models a compact healthcare analytics scenario focused on patient journeys, inpatient discharge denominators, diagnosis intervals, lab observations, claims, payer coverage, and quality-measure populations. It is designed to keep clinical, billing, and regulatory grains separate while still making common questions easy to ask.

The analytical center is `inpatient_stays`: one row per inpatient stay and discharge. Encounters preserve broader clinical utilization, diagnosis intervals carry clinical valid dates, lab results remain observation facts, claims represent billing outcomes, payer coverage is selected by encounter date, and quality-measure population rows make the denominator grain explicit.

```mermaid
erDiagram
  PATIENTS ||--o{ ENCOUNTERS : has
  FACILITIES ||--o{ ENCOUNTERS : hosts
  PROVIDERS ||--o{ ENCOUNTERS : attends
  ENCOUNTERS ||--o| INPATIENT_STAYS : may_create
  PATIENTS ||--o{ INPATIENT_STAYS : discharged_from
  FACILITIES ||--o{ INPATIENT_STAYS : discharges
  PROVIDERS ||--o{ INPATIENT_STAYS : accountable_for
  PATIENTS ||--o{ DIAGNOSIS_INTERVALS : has
  ENCOUNTERS ||--o{ DIAGNOSIS_INTERVALS : documents
  PATIENTS ||--o{ LAB_RESULTS : has
  ENCOUNTERS ||--o{ LAB_RESULTS : observes
  PROVIDERS ||--o{ LAB_RESULTS : orders
  ENCOUNTERS ||--o{ CLAIMS : billed_by
  PATIENTS ||--o{ PAYER_COVERAGE_INTERVALS : covered_by
  INPATIENT_STAYS ||--o{ READMISSION_EVENTS : index_stay
  INPATIENT_STAYS ||--o{ QUALITY_MEASURE_POPULATIONS : evaluated_as

  PATIENTS {
    varchar patient_id PK
    varchar medical_record_number
    date birth_date
    varchar sex_at_birth
  }

  FACILITIES {
    varchar facility_id PK
    varchar facility_code
    varchar facility_name
    varchar facility_type
    varchar region
  }

  PROVIDERS {
    varchar provider_id PK
    varchar npi
    varchar provider_name
    varchar specialty
  }

  ENCOUNTERS {
    varchar encounter_id PK
    varchar patient_id FK
    varchar facility_id FK
    varchar attending_provider_id FK
    varchar encounter_type
    timestamp admit_at
    timestamp discharge_at
  }

  INPATIENT_STAYS {
    varchar stay_id PK
    varchar encounter_id FK
    varchar patient_id FK
    date discharge_date
    boolean index_stay_eligible_flag
  }

  DIAGNOSIS_INTERVALS {
    varchar diagnosis_interval_id PK
    varchar patient_id FK
    varchar encounter_id FK
    varchar diagnosis_code
    date clinical_valid_start
    date clinical_valid_end
  }

  LAB_RESULTS {
    varchar lab_result_id PK
    varchar patient_id FK
    varchar encounter_id FK
    varchar test_code
    timestamp resulted_at
    numeric result_value
  }

  CLAIMS {
    varchar claim_id PK
    varchar encounter_id FK
    varchar patient_id FK
    varchar claim_status
    numeric billed_amount
    numeric paid_amount
  }

  PAYER_COVERAGE_INTERVALS {
    varchar coverage_interval_id PK
    varchar patient_id FK
    varchar payer_name
    date coverage_start_date
    date coverage_end_date
  }

  READMISSION_EVENTS {
    varchar readmission_event_id PK
    varchar index_stay_id FK
    varchar readmission_stay_id FK
    integer days_after_discharge
  }

  QUALITY_MEASURE_POPULATIONS {
    varchar population_member_id PK
    varchar measure_id
    varchar denominator_grain
    varchar stay_id FK
    boolean denominator_flag
    boolean numerator_flag
  }
```
