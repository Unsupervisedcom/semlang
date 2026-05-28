# Banking Credit Risk and Customer Exposure

This package models a compact banking risk scenario focused on legal customers, facilities, loans, exposure snapshots, collateral, guarantees, ratings, model scores, and quarterly review evidence.
It is designed to answer credit exposure questions without hiding the grains that make banking risk data difficult.

The analytical center is `loan_exposure_snapshots`: one row per loan, as-of date, accounting basis, stress scenario, and model run.
Collateral and guarantees attach through separate many-to-many paths, ratings and collateral valuations carry effective dates, and model scores keep scenario and model-version fields explicit so comparisons are deliberate.

```mermaid
erDiagram
  LEGAL_CUSTOMERS ||--o{ CREDIT_FACILITIES : borrows_under
  LEGAL_CUSTOMERS ||--o{ LOANS : borrows
  CREDIT_FACILITIES ||--o{ LOANS : funds
  LOANS ||--o{ LOAN_EXPOSURE_SNAPSHOTS : measured_as
  CREDIT_FACILITIES ||--o{ LOAN_EXPOSURE_SNAPSHOTS : reported_under
  LEGAL_CUSTOMERS ||--o{ LOAN_EXPOSURE_SNAPSHOTS : reported_for
  LEGAL_CUSTOMERS ||--o{ COLLATERAL_ASSETS : owns
  COLLATERAL_ASSETS ||--o{ COLLATERAL_VALUATIONS : valued_by
  LOANS ||--o{ LOAN_COLLATERAL_LINKS : secured_by
  COLLATERAL_ASSETS ||--o{ LOAN_COLLATERAL_LINKS : pledged_to
  LOANS ||--o{ GUARANTEES : supported_by
  LEGAL_CUSTOMERS ||--o{ GUARANTEES : guarantees
  LEGAL_CUSTOMERS ||--o{ MODEL_SCORE_SNAPSHOTS : scored_as
  LOANS ||--o{ MODEL_SCORE_SNAPSHOTS : scored_for
  LEGAL_CUSTOMERS ||--o{ QUARTERLY_REVIEWS : reviewed_as
  CREDIT_FACILITIES ||--o{ QUARTERLY_REVIEWS : reviewed_under
  LOANS ||--o{ QUARTERLY_REVIEWS : reviewed_for
  QUARTERLY_REVIEWS ||--o{ REVIEW_DOCUMENTS : evidenced_by
  QUARTERLY_REVIEWS ||--o{ RISK_RATINGS : produces
  LEGAL_CUSTOMERS ||--o{ RISK_RATINGS : rated_as
  CREDIT_FACILITIES ||--o{ RISK_RATINGS : rated_under
  LOANS ||--o{ RISK_RATINGS : rated_for

  LEGAL_CUSTOMERS {
    varchar legal_customer_id PK
    varchar customer_number
    varchar legal_name
    varchar customer_type
    varchar relationship_group_id
  }

  CREDIT_FACILITIES {
    varchar facility_id PK
    varchar legal_customer_id FK
    varchar facility_number
    varchar facility_type
    numeric commitment_amount
  }

  LOANS {
    varchar loan_id PK
    varchar facility_id FK
    varchar legal_customer_id FK
    varchar loan_number
    numeric original_principal_amount
  }

  LOAN_EXPOSURE_SNAPSHOTS {
    varchar exposure_snapshot_id PK
    date as_of_date
    varchar loan_id FK
    varchar accounting_basis
    varchar stress_scenario
    varchar model_version
    numeric ead_amount
  }

  COLLATERAL_ASSETS {
    varchar collateral_asset_id PK
    varchar owner_customer_id FK
    varchar asset_type
    numeric initial_appraised_value
  }

  COLLATERAL_VALUATIONS {
    varchar collateral_valuation_id PK
    varchar collateral_asset_id FK
    date valuation_date
    date valid_from
    date valid_to
    numeric net_collateral_value
  }

  LOAN_COLLATERAL_LINKS {
    varchar loan_id FK
    varchar collateral_asset_id FK
    date effective_from
    numeric allocation_percent
    numeric secured_amount_cap
  }

  GUARANTEES {
    varchar guarantee_id PK
    varchar loan_id FK
    varchar guarantor_customer_id FK
    numeric guaranteed_amount_cap
  }

  RISK_RATINGS {
    varchar risk_rating_id PK
    varchar rating_scope
    varchar rating_grade
    date effective_from
    date effective_to
  }

  MODEL_SCORE_SNAPSHOTS {
    varchar model_score_snapshot_id PK
    date as_of_date
    varchar model_name
    varchar model_version
    varchar stress_scenario
    numeric ecl_amount
  }

  QUARTERLY_REVIEWS {
    varchar review_id PK
    varchar legal_customer_id FK
    varchar facility_id FK
    varchar loan_id FK
    varchar review_quarter
    varchar review_status
  }

  REVIEW_DOCUMENTS {
    varchar review_document_id PK
    varchar review_id FK
    varchar document_type
    varchar document_status
  }
```
