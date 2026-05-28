INSERT INTO stores (
  store_id, store_code, store_name, channel_role, region, market,
  opened_date, closed_date, same_store_start_date
) VALUES
  ('STORE_DEN', 'DEN-01', 'Denver Cherry Creek', 'physical_store', 'Mountain', 'Denver', DATE '2018-04-12', NULL, DATE '2019-04-12'),
  ('STORE_PDX', 'PDX-02', 'Portland Pearl', 'physical_store', 'Pacific Northwest', 'Portland', DATE '2023-10-01', NULL, NULL),
  ('ECOM_US', 'WEB-US', 'US Ecommerce', 'ecommerce', 'Digital', 'United States', DATE '2016-01-01', NULL, DATE '2017-01-01'),
  ('FC_RENO', 'FC-RNO', 'Reno Fulfillment Center', 'warehouse', 'Mountain', 'Reno', DATE '2020-08-15', NULL, DATE '2021-08-15');

INSERT INTO customers (
  customer_id, loyalty_member_id, household_id, payment_card_hash,
  email_hash, legal_name, email_address, phone_number, postal_code,
  pii_verified_at, service_region, first_seen_at, pii_consent_status
) VALUES
  (
    'CUST_L_1001', 'LM-1001', 'HH-77', 'card_hash_1001', 'hash_email_1001',
    'Avery Martinez', 'avery.martinez@example.com', '+1-303-555-0101', '80206',
    TIMESTAMP '2022-01-15 09:20:00', 'Mountain', TIMESTAMP '2022-01-15 09:14:00', 'granted'
  ),
  (
    'CUST_L_1002', 'LM-1002', 'HH-88', NULL, 'hash_email_1002',
    'Jordan Lee', 'jordan.lee@example.com', '+1-503-555-0102', '97209',
    TIMESTAMP '2023-07-04 18:30:00', 'Pacific Northwest', TIMESTAMP '2023-07-04 18:22:00', 'declined'
  ),
  (
    'CUST_CARD_2001', NULL, 'HH-91', 'card_hash_2001', NULL,
    'Morgan Chen', 'morgan.chen@example.com', NULL, '89501',
    NULL, 'Mountain', TIMESTAMP '2024-02-20 11:03:00', 'unknown'
  );

INSERT INTO loyalty_point_balance (
  loyalty_member_id, balance_date, point_balance
) VALUES
  ('LM-1001', DATE '2025-01-12', 1840),
  ('LM-1001', DATE '2025-01-13', 1995),
  ('LM-1001', DATE '2025-01-31', 1995),
  ('LM-1002', DATE '2025-02-07', 620),
  ('LM-1002', DATE '2025-02-20', 755),
  ('LM-1002', DATE '2025-02-28', 755);

INSERT INTO product_skus (sku_id, sku_number, upc_code, created_at) VALUES
  ('SKU_BOOT_001', 'BOOT-001-BRN-09', '000111222333', TIMESTAMP '2021-05-01 10:00:00'),
  ('SKU_JACKET_010', 'JKT-010-BLK-M', '000111222344', TIMESTAMP '2022-08-15 10:00:00'),
  ('SKU_TOTE_777', 'TOTE-777-NAVY', '000111222355', TIMESTAMP '2023-01-10 10:00:00'),
  ('SKU_MUG_050', 'MUG-050-WHT', '000111222366', TIMESTAMP '2023-06-12 10:00:00');

INSERT INTO product_sku_history (
  product_version_id, sku_id, valid_from, valid_to, product_name, brand,
  department, category_name, subcategory_name, lifecycle_status,
  list_price, standard_cost
) VALUES
  ('PV_BOOT_001_2024', 'SKU_BOOT_001', DATE '2024-01-01', DATE '2025-01-01', 'Trail Boot', 'North Ridge', 'Footwear', 'Outdoor Footwear', 'Hiking Boots', 'active', 140.00, 72.00),
  ('PV_BOOT_001_2025', 'SKU_BOOT_001', DATE '2025-01-01', DATE '9999-12-31', 'Trail Boot', 'North Ridge', 'Footwear', 'Performance Footwear', 'Hiking Boots', 'active', 150.00, 76.00),
  ('PV_JACKET_010_2024', 'SKU_JACKET_010', DATE '2024-01-01', DATE '2025-03-01', 'City Shell Jacket', 'Harbor Line', 'Apparel', 'Outerwear', 'Rain Jackets', 'active', 220.00, 118.00),
  ('PV_JACKET_010_2025', 'SKU_JACKET_010', DATE '2025-03-01', DATE '9999-12-31', 'City Shell Jacket', 'Harbor Line', 'Apparel', 'Outerwear', 'Rain Jackets', 'discontinued', 199.00, 118.00),
  ('PV_TOTE_777_2024', 'SKU_TOTE_777', DATE '2024-01-01', DATE '9999-12-31', 'Commuter Tote', 'Metro Goods', 'Accessories', 'Bags', 'Totes', 'active', 64.00, 25.00),
  ('PV_MUG_050_2024', 'SKU_MUG_050', DATE '2024-01-01', DATE '9999-12-31', 'Camp Mug', 'North Ridge', 'Home', 'Drinkware', 'Mugs', 'recalled', 18.00, 6.00);

INSERT INTO promotions (
  promotion_id, promo_code, promotion_name, promotion_type, funding_source,
  starts_at, ends_at
) VALUES
  ('PROMO_WINTER10', 'WINTER10', 'Winter Ten Percent', 'coupon', 'retailer', TIMESTAMP '2025-01-01 00:00:00', TIMESTAMP '2025-02-01 00:00:00'),
  ('PROMO_VENDOR_BOOT', 'BOOTVENDOR25', 'Vendor Boot Event', 'markdown', 'vendor', TIMESTAMP '2025-01-10 00:00:00', TIMESTAMP '2025-01-20 00:00:00'),
  ('PROMO_LOYALTY_TOTE', 'LOYALTYTOTE', 'Loyalty Tote Reward', 'loyalty_offer', 'shared', TIMESTAMP '2025-01-01 00:00:00', TIMESTAMP '2025-03-01 00:00:00'),
  ('PROMO_SHIP_FREE', 'SHIPFREE', 'Free Standard Shipping', 'free_shipping', 'retailer', TIMESTAMP '2025-01-01 00:00:00', TIMESTAMP '2025-12-31 23:59:59');

INSERT INTO transactions (
  transaction_id, sold_at, store_id, customer_id, channel, fulfillment_method
) VALUES
  ('TXN_10001', TIMESTAMP '2025-01-12 10:15:00', 'STORE_DEN', 'CUST_L_1001', 'store', 'cash_and_carry'),
  ('TXN_10002', TIMESTAMP '2025-01-13 14:42:00', 'ECOM_US', 'CUST_CARD_2001', 'web', 'ship_to_home'),
  ('TXN_10003', TIMESTAMP '2025-01-14 16:05:00', 'STORE_PDX', NULL, 'store', 'cash_and_carry'),
  ('TXN_10004', TIMESTAMP '2025-02-07 09:35:00', 'ECOM_US', 'CUST_L_1002', 'mobile', 'buy_online_pickup_store'),
  ('TXN_10005', TIMESTAMP '2025-03-05 12:20:00', 'STORE_DEN', NULL, 'store', 'cash_and_carry'),
  ('TXN_10006', TIMESTAMP '2024-12-20 17:55:00', 'STORE_DEN', 'CUST_CARD_2001', 'store', 'cash_and_carry');

INSERT INTO retail_line_items (
  line_item_id, transaction_id, line_number, sku_id, quantity, unit_list_price,
  gross_sales_amount, discount_amount, net_sales_amount, merchandise_cost_amount,
  tax_amount
) VALUES
  ('LINE_10001_1', 'TXN_10001', 1, 'SKU_BOOT_001', 1, 150.00, 150.00, 37.50, 112.50, 76.00, 8.44),
  ('LINE_10001_2', 'TXN_10001', 2, 'SKU_TOTE_777', 1, 64.00, 64.00, 10.00, 54.00, 25.00, 4.05),
  ('LINE_10002_1', 'TXN_10002', 1, 'SKU_JACKET_010', 1, 220.00, 220.00, 22.00, 198.00, 118.00, 14.85),
  ('LINE_10003_1', 'TXN_10003', 1, 'SKU_MUG_050', 2, 18.00, 36.00, 0.00, 36.00, 12.00, 2.70),
  ('LINE_10004_1', 'TXN_10004', 1, 'SKU_BOOT_001', 2, 150.00, 300.00, 30.00, 270.00, 152.00, 20.25),
  ('LINE_10005_1', 'TXN_10005', 1, 'SKU_JACKET_010', 1, 199.00, 199.00, 40.00, 159.00, 118.00, 11.93),
  ('LINE_10006_1', 'TXN_10006', 1, 'SKU_BOOT_001', 1, 140.00, 140.00, 0.00, 140.00, 72.00, 10.50);

INSERT INTO line_item_promotions (
  line_item_id, promotion_id, allocation_amount, allocation_basis
) VALUES
  ('LINE_10001_1', 'PROMO_VENDOR_BOOT', 25.00, 'line_discount'),
  ('LINE_10001_1', 'PROMO_WINTER10', 12.50, 'order_proration'),
  ('LINE_10001_2', 'PROMO_LOYALTY_TOTE', 10.00, 'line_discount'),
  ('LINE_10002_1', 'PROMO_WINTER10', 22.00, 'line_discount'),
  ('LINE_10004_1', 'PROMO_WINTER10', 30.00, 'line_discount'),
  ('LINE_10002_1', 'PROMO_SHIP_FREE', 8.95, 'shipping_credit');

INSERT INTO return_lines (
  return_line_id, return_authorization_id, original_line_item_id, returned_at,
  return_channel, return_status, returned_quantity, refund_amount,
  restocking_fee_amount, reason_code, settled_at
) VALUES
  ('RET_50001_1', 'RA_50001', 'LINE_10001_1', TIMESTAMP '2025-01-18 13:00:00', 'store', 'settled', 1, 112.50, 0.00, 'SIZE_TOO_SMALL', TIMESTAMP '2025-01-18 13:12:00'),
  ('RET_50002_1', 'RA_50002', 'LINE_10004_1', TIMESTAMP '2025-02-20 11:30:00', 'store', 'accepted', 1, 135.00, 0.00, 'ORDERED_MULTIPLE_SIZES', NULL),
  ('RET_50003_1', 'RA_50003', 'LINE_10003_1', TIMESTAMP '2025-01-20 09:10:00', 'store', 'authorized', 1, 0.00, 0.00, 'PRODUCT_RECALL', NULL),
  ('RET_50004_1', 'RA_50004', 'LINE_10002_1', TIMESTAMP '2025-02-03 15:45:00', 'mail', 'rejected', 1, 0.00, 0.00, 'OUTSIDE_POLICY', NULL),
  ('RET_50005_1', 'RA_50005', 'LINE_10005_1', TIMESTAMP '2025-03-10 10:25:00', 'carrier_pickup', 'settled', 1, 149.00, 10.00, 'DAMAGED_IN_TRANSIT', TIMESTAMP '2025-03-12 08:00:00');

INSERT INTO inventory_snapshots (
  inventory_snapshot_id, snapshot_date, store_id, sku_id, on_hand_units,
  on_order_units, reserved_units, damaged_units, snapshot_source
) VALUES
  ('INV_20250112_DEN_BOOT', DATE '2025-01-12', 'STORE_DEN', 'SKU_BOOT_001', 8, 12, 1, 0, 'store_count'),
  ('INV_20250112_DEN_TOTE', DATE '2025-01-12', 'STORE_DEN', 'SKU_TOTE_777', 15, 0, 0, 1, 'store_count'),
  ('INV_20250112_WEB_JACKET', DATE '2025-01-12', 'ECOM_US', 'SKU_JACKET_010', 42, 20, 6, 0, 'ecommerce_available_to_sell'),
  ('INV_20250131_DEN_BOOT', DATE '2025-01-31', 'STORE_DEN', 'SKU_BOOT_001', 5, 18, 0, 1, 'store_count'),
  ('INV_20250131_PDX_MUG', DATE '2025-01-31', 'STORE_PDX', 'SKU_MUG_050', -2, 0, 0, 2, 'store_count'),
  ('INV_20250228_RENO_BOOT', DATE '2025-02-28', 'FC_RENO', 'SKU_BOOT_001', 120, 60, 15, 0, 'warehouse_management'),
  ('INV_20250228_WEB_BOOT', DATE '2025-02-28', 'ECOM_US', 'SKU_BOOT_001', 32, 40, 4, 0, 'ecommerce_available_to_sell'),
  ('INV_20250305_DEN_JACKET', DATE '2025-03-05', 'STORE_DEN', 'SKU_JACKET_010', 3, 0, 0, 0, 'store_count');
