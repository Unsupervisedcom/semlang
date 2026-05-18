CREATE TABLE stores (
  store_id VARCHAR(20) PRIMARY KEY,
  store_code VARCHAR(20) NOT NULL UNIQUE,
  store_name VARCHAR(100) NOT NULL,
  channel_role VARCHAR(30) NOT NULL CHECK (channel_role IN ('physical_store', 'ecommerce', 'warehouse')),
  region VARCHAR(50) NOT NULL,
  market VARCHAR(50) NOT NULL,
  opened_date DATE NOT NULL,
  closed_date DATE,
  same_store_start_date DATE,
  CHECK (closed_date IS NULL OR closed_date >= opened_date)
);

CREATE TABLE customer_identities (
  customer_identity_id VARCHAR(30) PRIMARY KEY,
  identity_mode VARCHAR(30) NOT NULL CHECK (identity_mode IN ('loyalty', 'known_guest', 'anonymous')),
  loyalty_member_id VARCHAR(30),
  household_id VARCHAR(30),
  email_hash VARCHAR(128),
  first_seen_at TIMESTAMP NOT NULL,
  pii_consent_status VARCHAR(30) NOT NULL CHECK (pii_consent_status IN ('granted', 'declined', 'unknown')),
  CHECK (
    (identity_mode = 'loyalty' AND loyalty_member_id IS NOT NULL)
    OR identity_mode <> 'loyalty'
  )
);

CREATE TABLE product_skus (
  sku_id VARCHAR(30) PRIMARY KEY,
  sku_number VARCHAR(40) NOT NULL UNIQUE,
  upc_code VARCHAR(40),
  created_at TIMESTAMP NOT NULL
);

CREATE TABLE product_sku_history (
  product_version_id VARCHAR(40) PRIMARY KEY,
  sku_id VARCHAR(30) NOT NULL REFERENCES product_skus(sku_id),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  brand VARCHAR(80) NOT NULL,
  department VARCHAR(80) NOT NULL,
  category_name VARCHAR(80) NOT NULL,
  subcategory_name VARCHAR(80) NOT NULL,
  lifecycle_status VARCHAR(30) NOT NULL CHECK (lifecycle_status IN ('active', 'discontinued', 'recalled')),
  list_price NUMERIC(12, 2) NOT NULL CHECK (list_price >= 0),
  standard_cost NUMERIC(12, 2) NOT NULL CHECK (standard_cost >= 0),
  CHECK (valid_to > valid_from),
  UNIQUE (sku_id, valid_from)
);

CREATE TABLE promotions (
  promotion_id VARCHAR(30) PRIMARY KEY,
  promo_code VARCHAR(40) NOT NULL UNIQUE,
  promotion_name VARCHAR(120) NOT NULL,
  promotion_type VARCHAR(30) NOT NULL CHECK (promotion_type IN ('coupon', 'markdown', 'loyalty_offer', 'free_shipping')),
  funding_source VARCHAR(30) NOT NULL CHECK (funding_source IN ('retailer', 'vendor', 'shared')),
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  CHECK (ends_at > starts_at)
);

CREATE TABLE retail_line_items (
  line_item_id VARCHAR(40) PRIMARY KEY,
  transaction_id VARCHAR(40) NOT NULL,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  sold_at TIMESTAMP NOT NULL,
  store_id VARCHAR(20) NOT NULL REFERENCES stores(store_id),
  sku_id VARCHAR(30) NOT NULL REFERENCES product_skus(sku_id),
  customer_identity_id VARCHAR(30) NOT NULL REFERENCES customer_identities(customer_identity_id),
  channel VARCHAR(30) NOT NULL CHECK (channel IN ('store', 'web', 'mobile')),
  fulfillment_method VARCHAR(30) NOT NULL CHECK (fulfillment_method IN ('cash_and_carry', 'ship_to_home', 'buy_online_pickup_store')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_list_price NUMERIC(12, 2) NOT NULL CHECK (unit_list_price >= 0),
  gross_sales_amount NUMERIC(12, 2) NOT NULL CHECK (gross_sales_amount >= 0),
  discount_amount NUMERIC(12, 2) NOT NULL CHECK (discount_amount >= 0),
  net_sales_amount NUMERIC(12, 2) NOT NULL CHECK (net_sales_amount >= 0),
  merchandise_cost_amount NUMERIC(12, 2) NOT NULL CHECK (merchandise_cost_amount >= 0),
  tax_amount NUMERIC(12, 2) NOT NULL CHECK (tax_amount >= 0),
  UNIQUE (transaction_id, line_number)
);

CREATE TABLE line_item_promotions (
  line_item_id VARCHAR(40) NOT NULL REFERENCES retail_line_items(line_item_id),
  promotion_id VARCHAR(30) NOT NULL REFERENCES promotions(promotion_id),
  allocation_amount NUMERIC(12, 2) NOT NULL CHECK (allocation_amount >= 0),
  allocation_basis VARCHAR(30) NOT NULL CHECK (allocation_basis IN ('line_discount', 'order_proration', 'shipping_credit')),
  PRIMARY KEY (line_item_id, promotion_id)
);

CREATE TABLE return_lines (
  return_line_id VARCHAR(40) PRIMARY KEY,
  return_authorization_id VARCHAR(40) NOT NULL,
  original_line_item_id VARCHAR(40) NOT NULL REFERENCES retail_line_items(line_item_id),
  returned_at TIMESTAMP NOT NULL,
  return_channel VARCHAR(30) NOT NULL CHECK (return_channel IN ('store', 'mail', 'carrier_pickup')),
  return_status VARCHAR(30) NOT NULL CHECK (return_status IN ('authorized', 'received', 'accepted', 'rejected', 'settled')),
  returned_quantity INTEGER NOT NULL CHECK (returned_quantity > 0),
  refund_amount NUMERIC(12, 2) NOT NULL CHECK (refund_amount >= 0),
  restocking_fee_amount NUMERIC(12, 2) NOT NULL CHECK (restocking_fee_amount >= 0),
  reason_code VARCHAR(40) NOT NULL,
  settled_at TIMESTAMP,
  CHECK (
    (return_status = 'settled' AND settled_at IS NOT NULL)
    OR (return_status <> 'settled')
  )
);

CREATE TABLE inventory_snapshots (
  inventory_snapshot_id VARCHAR(50) PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  store_id VARCHAR(20) NOT NULL REFERENCES stores(store_id),
  sku_id VARCHAR(30) NOT NULL REFERENCES product_skus(sku_id),
  on_hand_units INTEGER NOT NULL,
  on_order_units INTEGER NOT NULL CHECK (on_order_units >= 0),
  reserved_units INTEGER NOT NULL CHECK (reserved_units >= 0),
  damaged_units INTEGER NOT NULL CHECK (damaged_units >= 0),
  snapshot_source VARCHAR(30) NOT NULL CHECK (snapshot_source IN ('store_count', 'warehouse_management', 'ecommerce_available_to_sell')),
  UNIQUE (snapshot_date, store_id, sku_id)
);

