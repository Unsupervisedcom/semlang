# SaaS Product Usage and Revenue

This package models a compact SaaS analytics scenario focused on accounts, workspaces, users, plans, subscriptions, contracts, invoices, revenue recognition, entitlements, product usage, support, incidents, and renewals. It is designed to answer recurring-revenue and product-adoption questions without flattening finance, usage, and lifecycle facts into one unsafe customer table.

The analytical center is `subscription_periods`: one row per subscription period with contracted ARR, MRR run-rate, expansion, contraction, and churn timing. Recognized revenue is modeled separately from invoice lines in `revenue_recognition`, product activity is modeled at user-day and feature-day grains, and entitlements are effective-dated so historical usage can be evaluated against the plan rights in force on the activity date.

```mermaid
erDiagram
  ACCOUNTS ||--o{ WORKSPACES : owns
  ACCOUNTS ||--o{ SUBSCRIPTIONS : buys
  ACCOUNTS ||--o{ CONTRACTS : signs
  ACCOUNTS ||--o{ INVOICES : billed_to
  ACCOUNTS ||--o{ USER_ACTIVITY_DAYS : active_on
  ACCOUNTS ||--o{ SUPPORT_CASES : opens
  ACCOUNTS ||--o{ RENEWALS : reviews
  WORKSPACES ||--o{ USERS : contains
  WORKSPACES ||--o{ USER_ACTIVITY_DAYS : records
  WORKSPACES ||--o{ FEATURE_USAGE_DAYS : uses
  WORKSPACES ||--o{ INCIDENT_WORKSPACE_IMPACTS : affected_by
  USERS ||--o{ USER_ACTIVITY_DAYS : produces
  USERS ||--o{ FEATURE_USAGE_DAYS : triggers
  PRODUCT_PLANS ||--o{ SUBSCRIPTIONS : governs
  PRODUCT_PLANS ||--o{ ENTITLEMENT_INTERVALS : grants
  PRODUCT_FEATURES ||--o{ ENTITLEMENT_INTERVALS : entitled_as
  PRODUCT_FEATURES ||--o{ FEATURE_USAGE_DAYS : measured_as
  SUBSCRIPTIONS ||--o{ SUBSCRIPTION_PERIODS : snapshots
  SUBSCRIPTIONS ||--o{ CONTRACTS : contracted_by
  SUBSCRIPTIONS ||--o{ INVOICE_LINES : billed_by
  INVOICES ||--o{ INVOICE_LINES : contains
  INVOICE_LINES ||--o{ REVENUE_RECOGNITION : recognized_from
  ENTITLEMENT_INTERVALS ||--o{ FEATURE_USAGE_DAYS : valid_for
  INCIDENTS ||--o{ INCIDENT_WORKSPACE_IMPACTS : affects
  CONTRACTS ||--o{ RENEWALS : current_term

  ACCOUNTS {
    varchar account_id PK
    varchar account_name
    varchar segment
    varchar region
  }

  WORKSPACES {
    varchar workspace_id PK
    varchar account_id FK
    varchar workspace_type
    timestamp created_at
  }

  USERS {
    varchar user_id PK
    varchar workspace_id FK
    varchar account_id FK
    varchar seat_type
    timestamp created_at
  }

  PRODUCT_PLANS {
    varchar plan_id PK
    varchar plan_code
    varchar plan_family
    numeric base_arr_amount
  }

  PRODUCT_FEATURES {
    varchar feature_key PK
    varchar feature_family
    date release_date
  }

  SUBSCRIPTIONS {
    varchar subscription_id PK
    varchar account_id FK
    varchar plan_id FK
    varchar subscription_state
    numeric contracted_arr
  }

  CONTRACTS {
    varchar contract_id PK
    varchar account_id FK
    varchar subscription_id FK
    numeric booking_arr
    numeric arr_delta
  }

  SUBSCRIPTION_PERIODS {
    varchar subscription_period_id PK
    varchar subscription_id FK
    date period_start
    numeric ending_arr
    boolean churn_effective_flag
  }

  INVOICES {
    varchar invoice_id PK
    varchar account_id FK
    date invoice_date
    numeric invoice_total
  }

  INVOICE_LINES {
    varchar invoice_line_id PK
    varchar invoice_id FK
    date service_period_start
    numeric billed_amount
  }

  REVENUE_RECOGNITION {
    varchar revenue_recognition_id PK
    varchar invoice_line_id FK
    date recognition_month
    numeric recognized_revenue_amount
  }

  ENTITLEMENT_INTERVALS {
    varchar entitlement_interval_id PK
    varchar plan_id FK
    varchar feature_key FK
    date valid_from
    date valid_to
  }

  USER_ACTIVITY_DAYS {
    varchar user_activity_day_id PK
    date activity_date
    varchar user_id FK
    integer sessions_count
  }

  FEATURE_USAGE_DAYS {
    varchar feature_usage_day_id PK
    date activity_date
    varchar feature_key FK
    integer usage_count
  }

  SUPPORT_CASES {
    varchar support_case_id PK
    varchar account_id FK
    timestamp opened_at
    varchar case_status
  }

  INCIDENTS {
    varchar incident_id PK
    timestamp started_at
    varchar severity
  }

  INCIDENT_WORKSPACE_IMPACTS {
    varchar incident_impact_id PK
    varchar incident_id FK
    varchar workspace_id FK
    integer impact_minutes
  }

  RENEWALS {
    varchar renewal_id PK
    varchar account_id FK
    varchar subscription_id FK
    date renewal_due_date
    numeric renewal_arr
  }
```
