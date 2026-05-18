INSERT INTO suppliers (
  supplier_id, supplier_code, supplier_name, supplier_tier, country_code,
  approved_status, approved_at
) VALUES
  ('SUP_CHIP_NOVA', 'NOVA-IC', 'Nova Integrated Circuits', 'tier_1', 'US', 'approved', TIMESTAMP '2023-02-15 09:00:00'),
  ('SUP_BATT_ALPINE', 'ALP-BAT', 'Alpine Battery Works', 'tier_1', 'JP', 'approved', TIMESTAMP '2022-11-08 14:30:00'),
  ('SUP_CASE_HARBOR', 'HBR-CASE', 'Harbor Molded Components', 'tier_2', 'MX', 'conditional', TIMESTAMP '2024-03-20 10:15:00'),
  ('SUP_PACK_SUMMIT', 'SMT-PKG', 'Summit Packaging', 'tier_2', 'US', 'approved', TIMESTAMP '2021-06-10 08:00:00');

INSERT INTO materials (
  material_id, material_number, material_name, material_type, unit_of_measure,
  criticality_level
) VALUES
  ('MAT_CTRL_900', 'CTRL-900', 'Control Board Assembly', 'subassembly', 'each', 'safety_critical'),
  ('MAT_BATT_2200', 'BATT-2200', 'Lithium Battery Pack', 'component', 'each', 'safety_critical'),
  ('MAT_CASE_100', 'CASE-100', 'Thermal Housing', 'component', 'each', 'quality_critical'),
  ('MAT_LABEL_01', 'LBL-01', 'Regulatory Label', 'packaging', 'each', 'standard');

INSERT INTO supplier_lots (
  supplier_lot_id, supplier_id, material_id, lot_number, supplier_batch_code,
  received_date, expiration_date, received_quantity, accepted_quantity, lot_status,
  source_certificate_id
) VALUES
  ('LOT_CTRL_A100', 'SUP_CHIP_NOVA', 'MAT_CTRL_900', 'A100', 'NC-A100-25', DATE '2025-01-03', NULL, 500.000, 500.000, 'released', 'COC-NOVA-A100'),
  ('LOT_CTRL_A100_SPLIT_1', 'SUP_CHIP_NOVA', 'MAT_CTRL_900', 'A100-S1', 'NC-A100-25-S1', DATE '2025-01-05', NULL, 240.000, 240.000, 'released', 'COC-NOVA-A100'),
  ('LOT_BATT_B450', 'SUP_BATT_ALPINE', 'MAT_BATT_2200', 'B450', 'AB-B450-25', DATE '2025-01-04', DATE '2027-01-04', 600.000, 590.000, 'released', 'COC-ALP-B450'),
  ('LOT_CASE_C210', 'SUP_CASE_HARBOR', 'MAT_CASE_100', 'C210', 'HC-C210-25', DATE '2025-01-06', NULL, 420.000, 405.000, 'released', 'COC-HBR-C210'),
  ('LOT_CASE_C211', 'SUP_CASE_HARBOR', 'MAT_CASE_100', 'C211', 'HC-C211-25', DATE '2025-01-20', NULL, 390.000, 360.000, 'quarantined', 'COC-HBR-C211'),
  ('LOT_LABEL_L700', 'SUP_PACK_SUMMIT', 'MAT_LABEL_01', 'L700', 'SP-L700-25', DATE '2025-01-05', NULL, 1200.000, 1200.000, 'released', 'COC-SMT-L700');

INSERT INTO supplier_lot_genealogy (
  lot_genealogy_id, parent_supplier_lot_id, child_supplier_lot_id,
  relationship_type, transferred_quantity, genealogy_recorded_at
) VALUES
  ('GEN_CTRL_A100_S1', 'LOT_CTRL_A100', 'LOT_CTRL_A100_SPLIT_1', 'split', 240.000, TIMESTAMP '2025-01-05 08:45:00'),
  ('GEN_CASE_C210_C211', 'LOT_CASE_C210', 'LOT_CASE_C211', 'rework', 35.000, TIMESTAMP '2025-01-21 11:10:00');

INSERT INTO product_models (
  product_model_id, model_number, model_name, model_family, regulatory_class,
  launched_date, retired_date
) VALUES
  ('MODEL_SENSOR_X1', 'SENSOR-X1', 'Industrial Sensor X1', 'Industrial Sensors', 'Class II', DATE '2023-09-01', NULL),
  ('MODEL_SENSOR_X2', 'SENSOR-X2', 'Industrial Sensor X2', 'Industrial Sensors', 'Class II', DATE '2024-11-15', NULL);

INSERT INTO bom_versions (
  bom_version_id, product_model_id, bom_number, revision_code, effective_from,
  effective_to, release_status, approved_at
) VALUES
  ('BOM_X1_REV_A', 'MODEL_SENSOR_X1', 'BOM-SENSOR-X1', 'A', DATE '2024-01-01', DATE '2025-02-01', 'superseded', TIMESTAMP '2023-12-18 15:00:00'),
  ('BOM_X1_REV_B', 'MODEL_SENSOR_X1', 'BOM-SENSOR-X1', 'B', DATE '2025-02-01', DATE '9999-12-31', 'released', TIMESTAMP '2025-01-22 13:30:00'),
  ('BOM_X2_REV_A', 'MODEL_SENSOR_X2', 'BOM-SENSOR-X2', 'A', DATE '2024-11-15', DATE '9999-12-31', 'released', TIMESTAMP '2024-10-28 09:20:00');

INSERT INTO bom_components (
  bom_component_id, bom_version_id, material_id, component_role, quantity_per_unit,
  scrap_factor_pct, valid_from, valid_to
) VALUES
  ('BC_X1A_CTRL', 'BOM_X1_REV_A', 'MAT_CTRL_900', 'primary', 1.000000, 1.500, DATE '2024-01-01', DATE '2025-02-01'),
  ('BC_X1A_BATT', 'BOM_X1_REV_A', 'MAT_BATT_2200', 'primary', 1.000000, 2.000, DATE '2024-01-01', DATE '2025-02-01'),
  ('BC_X1A_CASE', 'BOM_X1_REV_A', 'MAT_CASE_100', 'primary', 1.000000, 1.000, DATE '2024-01-01', DATE '2025-02-01'),
  ('BC_X1B_CTRL', 'BOM_X1_REV_B', 'MAT_CTRL_900', 'primary', 1.000000, 1.000, DATE '2025-02-01', DATE '9999-12-31'),
  ('BC_X1B_BATT', 'BOM_X1_REV_B', 'MAT_BATT_2200', 'primary', 1.000000, 1.500, DATE '2025-02-01', DATE '9999-12-31'),
  ('BC_X1B_CASE', 'BOM_X1_REV_B', 'MAT_CASE_100', 'primary', 1.000000, 0.800, DATE '2025-02-01', DATE '9999-12-31'),
  ('BC_X2A_CTRL', 'BOM_X2_REV_A', 'MAT_CTRL_900', 'primary', 1.000000, 1.200, DATE '2024-11-15', DATE '9999-12-31'),
  ('BC_X2A_BATT', 'BOM_X2_REV_A', 'MAT_BATT_2200', 'primary', 2.000000, 2.500, DATE '2024-11-15', DATE '9999-12-31'),
  ('BC_X2A_LABEL', 'BOM_X2_REV_A', 'MAT_LABEL_01', 'packaging', 1.000000, 0.500, DATE '2024-11-15', DATE '9999-12-31');

INSERT INTO production_orders (
  production_order_id, production_order_number, product_model_id, bom_version_id,
  manufacturing_site, line_code, order_status, planned_quantity, started_at, completed_at
) VALUES
  ('PO_10001', 'MO-10001', 'MODEL_SENSOR_X1', 'BOM_X1_REV_A', 'Denver Plant', 'LINE-3', 'closed', 4, TIMESTAMP '2025-01-15 06:00:00', TIMESTAMP '2025-01-15 14:20:00'),
  ('PO_10002', 'MO-10002', 'MODEL_SENSOR_X1', 'BOM_X1_REV_B', 'Denver Plant', 'LINE-3', 'completed', 3, TIMESTAMP '2025-02-10 06:15:00', TIMESTAMP '2025-02-10 13:10:00'),
  ('PO_10003', 'MO-10003', 'MODEL_SENSOR_X2', 'BOM_X2_REV_A', 'Austin Plant', 'LINE-1', 'completed', 3, TIMESTAMP '2025-02-12 07:00:00', TIMESTAMP '2025-02-12 16:35:00');

INSERT INTO production_order_lot_consumption (
  consumption_id, production_order_id, supplier_lot_id, material_id,
  consumed_quantity, consumed_at, consumption_source
) VALUES
  ('CON_PO10001_CTRL', 'PO_10001', 'LOT_CTRL_A100_SPLIT_1', 'MAT_CTRL_900', 4.000, TIMESTAMP '2025-01-15 06:20:00', 'mes_scan'),
  ('CON_PO10001_BATT', 'PO_10001', 'LOT_BATT_B450', 'MAT_BATT_2200', 4.000, TIMESTAMP '2025-01-15 06:25:00', 'mes_scan'),
  ('CON_PO10001_CASE', 'PO_10001', 'LOT_CASE_C210', 'MAT_CASE_100', 4.000, TIMESTAMP '2025-01-15 06:30:00', 'mes_scan'),
  ('CON_PO10002_CTRL', 'PO_10002', 'LOT_CTRL_A100_SPLIT_1', 'MAT_CTRL_900', 3.000, TIMESTAMP '2025-02-10 06:40:00', 'mes_scan'),
  ('CON_PO10002_BATT', 'PO_10002', 'LOT_BATT_B450', 'MAT_BATT_2200', 3.000, TIMESTAMP '2025-02-10 06:44:00', 'mes_scan'),
  ('CON_PO10002_CASE', 'PO_10002', 'LOT_CASE_C211', 'MAT_CASE_100', 3.000, TIMESTAMP '2025-02-10 06:48:00', 'inventory_issue'),
  ('CON_PO10003_CTRL', 'PO_10003', 'LOT_CTRL_A100', 'MAT_CTRL_900', 3.000, TIMESTAMP '2025-02-12 07:15:00', 'mes_scan'),
  ('CON_PO10003_BATT', 'PO_10003', 'LOT_BATT_B450', 'MAT_BATT_2200', 6.000, TIMESTAMP '2025-02-12 07:18:00', 'mes_scan'),
  ('CON_PO10003_LABEL', 'PO_10003', 'LOT_LABEL_L700', 'MAT_LABEL_01', 3.000, TIMESTAMP '2025-02-12 13:10:00', 'manual_adjustment');

INSERT INTO serialized_units (
  serial_number, production_order_id, product_model_id, bom_version_id,
  completed_at, unit_status, final_quality_disposition
) VALUES
  ('SN-X1-250115-001', 'PO_10001', 'MODEL_SENSOR_X1', 'BOM_X1_REV_A', TIMESTAMP '2025-01-15 10:40:00', 'shipped', 'accepted'),
  ('SN-X1-250115-002', 'PO_10001', 'MODEL_SENSOR_X1', 'BOM_X1_REV_A', TIMESTAMP '2025-01-15 11:05:00', 'shipped', 'accepted'),
  ('SN-X1-250115-003', 'PO_10001', 'MODEL_SENSOR_X1', 'BOM_X1_REV_A', TIMESTAMP '2025-01-15 12:25:00', 'held', 'rework_required'),
  ('SN-X1-250115-004', 'PO_10001', 'MODEL_SENSOR_X1', 'BOM_X1_REV_A', TIMESTAMP '2025-01-15 13:10:00', 'scrapped', 'rejected'),
  ('SN-X1-250210-001', 'PO_10002', 'MODEL_SENSOR_X1', 'BOM_X1_REV_B', TIMESTAMP '2025-02-10 10:35:00', 'shipped', 'accepted'),
  ('SN-X1-250210-002', 'PO_10002', 'MODEL_SENSOR_X1', 'BOM_X1_REV_B', TIMESTAMP '2025-02-10 11:45:00', 'released', 'accepted'),
  ('SN-X1-250210-003', 'PO_10002', 'MODEL_SENSOR_X1', 'BOM_X1_REV_B', TIMESTAMP '2025-02-10 12:30:00', 'held', 'rework_required'),
  ('SN-X2-250212-001', 'PO_10003', 'MODEL_SENSOR_X2', 'BOM_X2_REV_A', TIMESTAMP '2025-02-12 12:10:00', 'shipped', 'accepted'),
  ('SN-X2-250212-002', 'PO_10003', 'MODEL_SENSOR_X2', 'BOM_X2_REV_A', TIMESTAMP '2025-02-12 13:25:00', 'shipped', 'accepted'),
  ('SN-X2-250212-003', 'PO_10003', 'MODEL_SENSOR_X2', 'BOM_X2_REV_A', TIMESTAMP '2025-02-12 14:50:00', 'released', 'accepted');

INSERT INTO inspections (
  inspection_id, serial_number, production_order_id, inspection_type, performed_at,
  station_code, inspector_id, inspection_status, first_pass_flag
) VALUES
  ('INSP_SN001_FINAL', 'SN-X1-250115-001', 'PO_10001', 'final', TIMESTAMP '2025-01-15 11:00:00', 'QA-FINAL-1', 'INS-17', 'passed', 1),
  ('INSP_SN002_FINAL', 'SN-X1-250115-002', 'PO_10001', 'final', TIMESTAMP '2025-01-15 11:30:00', 'QA-FINAL-1', 'INS-17', 'passed', 1),
  ('INSP_SN003_FINAL', 'SN-X1-250115-003', 'PO_10001', 'final', TIMESTAMP '2025-01-15 12:45:00', 'QA-FINAL-1', 'INS-22', 'failed', 0),
  ('INSP_SN004_FINAL', 'SN-X1-250115-004', 'PO_10001', 'final', TIMESTAMP '2025-01-15 13:30:00', 'QA-FINAL-1', 'INS-22', 'failed', 0),
  ('INSP_SN005_FINAL', 'SN-X1-250210-001', 'PO_10002', 'final', TIMESTAMP '2025-02-10 10:55:00', 'QA-FINAL-1', 'INS-17', 'passed', 1),
  ('INSP_SN006_FINAL', 'SN-X1-250210-002', 'PO_10002', 'final', TIMESTAMP '2025-02-10 12:05:00', 'QA-FINAL-1', 'INS-17', 'passed', 1),
  ('INSP_SN007_FINAL', 'SN-X1-250210-003', 'PO_10002', 'final', TIMESTAMP '2025-02-10 12:50:00', 'QA-FINAL-1', 'INS-31', 'conditional', 0),
  ('INSP_SN008_FINAL', 'SN-X2-250212-001', 'PO_10003', 'final', TIMESTAMP '2025-02-12 12:40:00', 'QA-FINAL-2', 'INS-45', 'passed', 1),
  ('INSP_SN009_FINAL', 'SN-X2-250212-002', 'PO_10003', 'final', TIMESTAMP '2025-02-12 13:50:00', 'QA-FINAL-2', 'INS-45', 'passed', 1),
  ('INSP_SN010_FINAL', 'SN-X2-250212-003', 'PO_10003', 'final', TIMESTAMP '2025-02-12 15:10:00', 'QA-FINAL-2', 'INS-45', 'passed', 1);

INSERT INTO inspection_defects (
  defect_id, inspection_id, serial_number, production_order_id, defect_code,
  defect_category, severity_level, related_supplier_lot_id, defect_disposition,
  rework_hours, detected_at
) VALUES
  ('DEF_SN003_CASE', 'INSP_SN003_FINAL', 'SN-X1-250115-003', 'PO_10001', 'CASE_WARP', 'Housing fit', 'major', 'LOT_CASE_C210', 'rework', 1.50, TIMESTAMP '2025-01-15 12:48:00'),
  ('DEF_SN003_LABEL', 'INSP_SN003_FINAL', 'SN-X1-250115-003', 'PO_10001', 'LABEL_OFFSET', 'Labeling', 'minor', 'LOT_LABEL_L700', 'use_as_is', 0.10, TIMESTAMP '2025-01-15 12:50:00'),
  ('DEF_SN004_CTRL', 'INSP_SN004_FINAL', 'SN-X1-250115-004', 'PO_10001', 'NO_BOOT', 'Electrical test', 'critical', 'LOT_CTRL_A100_SPLIT_1', 'scrap', 0.00, TIMESTAMP '2025-01-15 13:35:00'),
  ('DEF_SN007_CASE', 'INSP_SN007_FINAL', 'SN-X1-250210-003', 'PO_10002', 'CASE_STRESS', 'Housing fit', 'major', 'LOT_CASE_C211', 'supplier_chargeback', 2.25, TIMESTAMP '2025-02-10 12:55:00');

INSERT INTO shipments (
  shipment_id, shipment_number, shipped_at, customer_account_id,
  destination_region, destination_country_code, carrier_name, shipment_status
) VALUES
  ('SHIP_9001', 'SHP-9001', TIMESTAMP '2025-01-17 15:00:00', 'CUST_NORTHGRID', 'North America West', 'US', 'FreightWay', 'delivered'),
  ('SHIP_9002', 'SHP-9002', TIMESTAMP '2025-02-14 09:30:00', 'CUST_METROTECH', 'North America East', 'US', 'ParcelRoute', 'shipped'),
  ('SHIP_9003', 'SHP-9003', TIMESTAMP '2025-02-15 10:20:00', 'CUST_EUROPLANT', 'Europe Central', 'DE', 'GlobalAir', 'shipped');

INSERT INTO shipment_units (
  shipment_unit_id, shipment_id, serial_number, shipped_unit_status
) VALUES
  ('SU_9001_001', 'SHIP_9001', 'SN-X1-250115-001', 'released'),
  ('SU_9001_002', 'SHIP_9001', 'SN-X1-250115-002', 'released'),
  ('SU_9002_001', 'SHIP_9002', 'SN-X1-250210-001', 'released'),
  ('SU_9003_001', 'SHIP_9003', 'SN-X2-250212-001', 'released'),
  ('SU_9003_002', 'SHIP_9003', 'SN-X2-250212-002', 'released');

INSERT INTO warranty_claims (
  warranty_claim_id, serial_number, claim_number, claim_opened_at, failure_code,
  failure_category, claim_status, claim_cost_amount, service_region
) VALUES
  ('WCL_7001', 'SN-X1-250115-001', 'WC-7001', TIMESTAMP '2025-03-03 10:12:00', 'INTERMITTENT_POWER', 'Electrical', 'approved', 185.00, 'North America West'),
  ('WCL_7002', 'SN-X1-250210-001', 'WC-7002', TIMESTAMP '2025-03-18 13:45:00', 'CASE_CRACK', 'Mechanical housing', 'opened', 95.00, 'North America East'),
  ('WCL_7003', 'SN-X2-250212-002', 'WC-7003', TIMESTAMP '2025-04-02 08:40:00', 'BATTERY_SWELL', 'Power system', 'approved', 240.00, 'Europe Central');

INSERT INTO recall_campaigns (
  recall_campaign_id, campaign_code, campaign_name, initiated_at, campaign_status,
  scope_rule_description, regulatory_report_required
) VALUES
  ('RC_2025_CTRL_A100', 'RC-CTRL-A100', 'Control board lot A100 field action', TIMESTAMP '2025-03-20 09:00:00', 'active', 'Units built with supplier lot LOT_CTRL_A100 or child lots and shipped before containment release.', 1),
  ('RC_2025_CASE_C211', 'RC-CASE-C211', 'Housing lot C211 containment', TIMESTAMP '2025-02-18 14:00:00', 'closed', 'Units built with quarantined housing lot LOT_CASE_C211; exclude units never shipped.', 0);

INSERT INTO recall_affected_units (
  recall_unit_id, recall_campaign_id, serial_number, traced_supplier_lot_id,
  scope_reason, affected_status, identified_at
) VALUES
  ('RAU_CTRL_001', 'RC_2025_CTRL_A100', 'SN-X1-250115-001', 'LOT_CTRL_A100_SPLIT_1', 'child_lot_consumed_and_shipped', 'notified', TIMESTAMP '2025-03-20 10:00:00'),
  ('RAU_CTRL_002', 'RC_2025_CTRL_A100', 'SN-X1-250115-002', 'LOT_CTRL_A100_SPLIT_1', 'child_lot_consumed_and_shipped', 'notified', TIMESTAMP '2025-03-20 10:05:00'),
  ('RAU_CTRL_003', 'RC_2025_CTRL_A100', 'SN-X1-250210-001', 'LOT_CTRL_A100_SPLIT_1', 'child_lot_consumed_and_shipped', 'identified', TIMESTAMP '2025-03-20 10:10:00'),
  ('RAU_CTRL_004', 'RC_2025_CTRL_A100', 'SN-X2-250212-001', 'LOT_CTRL_A100', 'parent_lot_consumed_and_shipped', 'identified', TIMESTAMP '2025-03-20 10:15:00'),
  ('RAU_CTRL_005', 'RC_2025_CTRL_A100', 'SN-X2-250212-002', 'LOT_CTRL_A100', 'parent_lot_consumed_and_shipped', 'identified', TIMESTAMP '2025-03-20 10:20:00'),
  ('RAU_CASE_001', 'RC_2025_CASE_C211', 'SN-X1-250210-001', 'LOT_CASE_C211', 'suspect_lot_consumed_and_shipped', 'remediated', TIMESTAMP '2025-02-18 15:00:00');
