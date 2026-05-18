# Manufacturing Supply Chain Traceability and Quality

This package models a compact manufacturing analytics scenario focused on supplier lots, product BOM versions, production orders, serialized units, inspections, defects, shipments, warranty claims, and recall scope. It is designed to demonstrate traceability and quality analysis without flattening physical flow into one table.

The analytical center is `serialized_units`: one row per manufactured unit. Production orders bind each unit to the BOM version used at build time, supplier lot consumption records which lots fed each order, lot genealogy records split and merge relationships, inspections and defects attach at unit and inspection grain, shipments move units to customers, warranty claims attach after shipment, and recall affected units define the scoped population for campaigns.

```mermaid
erDiagram
  SUPPLIERS ||--o{ SUPPLIER_LOTS : provides
  MATERIALS ||--o{ SUPPLIER_LOTS : identifies
  SUPPLIER_LOTS ||--o{ SUPPLIER_LOT_GENEALOGY : parent_lot
  SUPPLIER_LOTS ||--o{ SUPPLIER_LOT_GENEALOGY : child_lot
  PRODUCT_MODELS ||--o{ BOM_VERSIONS : has
  BOM_VERSIONS ||--o{ BOM_COMPONENTS : contains
  MATERIALS ||--o{ BOM_COMPONENTS : required_by
  PRODUCT_MODELS ||--o{ PRODUCTION_ORDERS : built_as
  BOM_VERSIONS ||--o{ PRODUCTION_ORDERS : used_by
  PRODUCTION_ORDERS ||--o{ PRODUCTION_ORDER_LOT_CONSUMPTION : consumes
  SUPPLIER_LOTS ||--o{ PRODUCTION_ORDER_LOT_CONSUMPTION : consumed_in
  PRODUCTION_ORDERS ||--o{ SERIALIZED_UNITS : produces
  SERIALIZED_UNITS ||--o{ INSPECTIONS : inspected_by
  INSPECTIONS ||--o{ INSPECTION_DEFECTS : finds
  SHIPMENTS ||--o{ SHIPMENT_UNITS : includes
  SERIALIZED_UNITS ||--o{ SHIPMENT_UNITS : shipped_as
  SERIALIZED_UNITS ||--o{ WARRANTY_CLAIMS : claimed_against
  RECALL_CAMPAIGNS ||--o{ RECALL_AFFECTED_UNITS : scopes
  SERIALIZED_UNITS ||--o{ RECALL_AFFECTED_UNITS : affected_as
  SUPPLIER_LOTS ||--o{ RECALL_AFFECTED_UNITS : traced_to

  SUPPLIERS {
    varchar supplier_id PK
    varchar supplier_code
    varchar supplier_name
    varchar country_code
  }

  MATERIALS {
    varchar material_id PK
    varchar material_number
    varchar material_type
  }

  SUPPLIER_LOTS {
    varchar supplier_lot_id PK
    varchar supplier_id FK
    varchar material_id FK
    varchar lot_number
    date received_date
  }

  SUPPLIER_LOT_GENEALOGY {
    varchar lot_genealogy_id PK
    varchar parent_supplier_lot_id FK
    varchar child_supplier_lot_id FK
    varchar relationship_type
    numeric transferred_quantity
  }

  PRODUCT_MODELS {
    varchar product_model_id PK
    varchar model_number
    varchar model_family
  }

  BOM_VERSIONS {
    varchar bom_version_id PK
    varchar product_model_id FK
    date effective_from
    date effective_to
    varchar release_status
  }

  BOM_COMPONENTS {
    varchar bom_component_id PK
    varchar bom_version_id FK
    varchar material_id FK
    numeric quantity_per_unit
  }

  PRODUCTION_ORDERS {
    varchar production_order_id PK
    varchar product_model_id FK
    varchar bom_version_id FK
    timestamp started_at
    integer planned_quantity
  }

  PRODUCTION_ORDER_LOT_CONSUMPTION {
    varchar consumption_id PK
    varchar production_order_id FK
    varchar supplier_lot_id FK
    varchar material_id FK
    numeric consumed_quantity
  }

  SERIALIZED_UNITS {
    varchar serial_number PK
    varchar production_order_id FK
    timestamp completed_at
    varchar unit_status
  }

  INSPECTIONS {
    varchar inspection_id PK
    varchar serial_number FK
    timestamp performed_at
    varchar inspection_status
  }

  INSPECTION_DEFECTS {
    varchar defect_id PK
    varchar inspection_id FK
    varchar serial_number FK
    varchar defect_category
  }

  SHIPMENTS {
    varchar shipment_id PK
    timestamp shipped_at
    varchar destination_region
  }

  SHIPMENT_UNITS {
    varchar shipment_unit_id PK
    varchar shipment_id FK
    varchar serial_number FK
    varchar shipped_unit_status
  }

  WARRANTY_CLAIMS {
    varchar warranty_claim_id PK
    varchar serial_number FK
    timestamp claim_opened_at
    numeric claim_cost_amount
  }

  RECALL_CAMPAIGNS {
    varchar recall_campaign_id PK
    varchar campaign_code
    timestamp initiated_at
    varchar campaign_status
  }

  RECALL_AFFECTED_UNITS {
    varchar recall_unit_id PK
    varchar recall_campaign_id FK
    varchar serial_number FK
    varchar traced_supplier_lot_id FK
  }
```
