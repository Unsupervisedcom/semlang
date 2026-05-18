# Retail Omnichannel Margin and Returns

This package models a compact retail analytics scenario focused on line-item sales, returns, product history, stores, recognized customers, loyalty point balances, promotions, and inventory snapshots. It is designed to demonstrate common retail questions without flattening different grains into one table.

The analytical center is `retail_line_items`: one row per sold SKU line. Returns and promotion allocations attach at line grain, product attributes are joined using valid-time history, stores provide channel and geography, nullable `customer_id` distinguishes recognized shoppers from unrecognized cash purchases, loyalty point balances add daily loyalty-member state, and inventory is modeled separately as daily SKU/store snapshots.

```mermaid
erDiagram
  STORES ||--o{ RETAIL_LINE_ITEMS : sells
  STORES ||--o{ INVENTORY_SNAPSHOTS : stocks
  CUSTOMERS ||--o{ RETAIL_LINE_ITEMS : identifies
  CUSTOMERS ||--o{ LOYALTY_POINT_BALANCE : earns
  PRODUCT_SKUS ||--o{ PRODUCT_SKU_HISTORY : versions
  PRODUCT_SKUS ||--o{ RETAIL_LINE_ITEMS : sold_as
  PRODUCT_SKUS ||--o{ INVENTORY_SNAPSHOTS : counted_as
  RETAIL_LINE_ITEMS ||--o{ RETURN_LINES : returned_by
  RETAIL_LINE_ITEMS ||--o{ LINE_ITEM_PROMOTIONS : discounted_by
  PROMOTIONS ||--o{ LINE_ITEM_PROMOTIONS : funds

  STORES {
    varchar store_id PK
    varchar store_code
    varchar store_name
    varchar channel_role
    varchar region
    date opened_date
  }

  CUSTOMERS {
    varchar customer_id PK
    varchar loyalty_member_id
    varchar household_id
    varchar payment_card_hash
    timestamp first_seen_at
  }

  LOYALTY_POINT_BALANCE {
    varchar loyalty_member_id PK, FK
    date balance_date PK
    integer point_balance
  }

  PRODUCT_SKUS {
    varchar sku_id PK
    varchar sku_number
    varchar upc_code
  }

  PRODUCT_SKU_HISTORY {
    varchar product_version_id PK
    varchar sku_id FK
    date valid_from
    date valid_to
    varchar category_name
    varchar lifecycle_status
  }

  RETAIL_LINE_ITEMS {
    varchar line_item_id PK
    varchar transaction_id
    timestamp sold_at
    varchar store_id FK
    varchar sku_id FK
    varchar customer_id FK
    numeric net_sales_amount
  }

  RETURN_LINES {
    varchar return_line_id PK
    varchar original_line_item_id FK
    timestamp returned_at
    varchar return_status
    numeric refund_amount
  }

  PROMOTIONS {
    varchar promotion_id PK
    varchar promo_code
    varchar promotion_type
    timestamp starts_at
    timestamp ends_at
  }

  LINE_ITEM_PROMOTIONS {
    varchar line_item_id FK
    varchar promotion_id FK
    numeric allocation_amount
  }

  INVENTORY_SNAPSHOTS {
    varchar inventory_snapshot_id PK
    date snapshot_date
    varchar store_id FK
    varchar sku_id FK
    integer on_hand_units
  }
```
