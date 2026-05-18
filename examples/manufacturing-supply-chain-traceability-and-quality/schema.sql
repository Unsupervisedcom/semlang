CREATE TABLE suppliers (
  supplier_id VARCHAR(30) PRIMARY KEY,
  supplier_code VARCHAR(30) NOT NULL UNIQUE,
  supplier_name VARCHAR(120) NOT NULL,
  supplier_tier VARCHAR(30) NOT NULL CHECK (supplier_tier IN ('tier_1', 'tier_2', 'contract_manufacturer')),
  country_code VARCHAR(2) NOT NULL,
  approved_status VARCHAR(30) NOT NULL CHECK (approved_status IN ('approved', 'conditional', 'suspended')),
  approved_at TIMESTAMP NOT NULL
);

CREATE TABLE materials (
  material_id VARCHAR(30) PRIMARY KEY,
  material_number VARCHAR(40) NOT NULL UNIQUE,
  material_name VARCHAR(120) NOT NULL,
  material_type VARCHAR(30) NOT NULL CHECK (material_type IN ('raw_material', 'component', 'subassembly', 'packaging')),
  unit_of_measure VARCHAR(20) NOT NULL,
  criticality_level VARCHAR(30) NOT NULL CHECK (criticality_level IN ('standard', 'quality_critical', 'safety_critical'))
);

CREATE TABLE supplier_lots (
  supplier_lot_id VARCHAR(40) PRIMARY KEY,
  supplier_id VARCHAR(30) NOT NULL REFERENCES suppliers(supplier_id),
  material_id VARCHAR(30) NOT NULL REFERENCES materials(material_id),
  lot_number VARCHAR(60) NOT NULL,
  supplier_batch_code VARCHAR(60),
  received_date DATE NOT NULL,
  expiration_date DATE,
  received_quantity NUMERIC(14, 3) NOT NULL CHECK (received_quantity >= 0),
  accepted_quantity NUMERIC(14, 3) NOT NULL CHECK (accepted_quantity >= 0),
  lot_status VARCHAR(30) NOT NULL CHECK (lot_status IN ('received', 'released', 'quarantined', 'rejected', 'depleted')),
  source_certificate_id VARCHAR(60),
  UNIQUE (supplier_id, material_id, lot_number),
  CHECK (expiration_date IS NULL OR expiration_date >= received_date),
  CHECK (accepted_quantity <= received_quantity)
);

CREATE TABLE supplier_lot_genealogy (
  lot_genealogy_id VARCHAR(50) PRIMARY KEY,
  parent_supplier_lot_id VARCHAR(40) NOT NULL REFERENCES supplier_lots(supplier_lot_id),
  child_supplier_lot_id VARCHAR(40) NOT NULL REFERENCES supplier_lots(supplier_lot_id),
  relationship_type VARCHAR(30) NOT NULL CHECK (relationship_type IN ('split', 'merge', 'relabel', 'rework')),
  transferred_quantity NUMERIC(14, 3) NOT NULL CHECK (transferred_quantity > 0),
  genealogy_recorded_at TIMESTAMP NOT NULL,
  CHECK (parent_supplier_lot_id <> child_supplier_lot_id)
);

CREATE TABLE product_models (
  product_model_id VARCHAR(30) PRIMARY KEY,
  model_number VARCHAR(40) NOT NULL UNIQUE,
  model_name VARCHAR(120) NOT NULL,
  model_family VARCHAR(80) NOT NULL,
  regulatory_class VARCHAR(40) NOT NULL,
  launched_date DATE NOT NULL,
  retired_date DATE,
  CHECK (retired_date IS NULL OR retired_date >= launched_date)
);

CREATE TABLE bom_versions (
  bom_version_id VARCHAR(40) PRIMARY KEY,
  product_model_id VARCHAR(30) NOT NULL REFERENCES product_models(product_model_id),
  bom_number VARCHAR(50) NOT NULL,
  revision_code VARCHAR(20) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NOT NULL,
  release_status VARCHAR(30) NOT NULL CHECK (release_status IN ('engineering', 'released', 'superseded', 'obsolete')),
  approved_at TIMESTAMP,
  UNIQUE (product_model_id, revision_code),
  CHECK (effective_to > effective_from),
  CHECK (
    (release_status IN ('released', 'superseded', 'obsolete') AND approved_at IS NOT NULL)
    OR release_status = 'engineering'
  )
);

CREATE TABLE bom_components (
  bom_component_id VARCHAR(50) PRIMARY KEY,
  bom_version_id VARCHAR(40) NOT NULL REFERENCES bom_versions(bom_version_id),
  material_id VARCHAR(30) NOT NULL REFERENCES materials(material_id),
  component_role VARCHAR(40) NOT NULL CHECK (component_role IN ('primary', 'alternate', 'consumable', 'packaging')),
  quantity_per_unit NUMERIC(14, 6) NOT NULL CHECK (quantity_per_unit > 0),
  scrap_factor_pct NUMERIC(6, 3) NOT NULL CHECK (scrap_factor_pct >= 0),
  valid_from DATE NOT NULL,
  valid_to DATE NOT NULL,
  CHECK (valid_to > valid_from),
  UNIQUE (bom_version_id, material_id, component_role, valid_from)
);

CREATE TABLE production_orders (
  production_order_id VARCHAR(40) PRIMARY KEY,
  production_order_number VARCHAR(50) NOT NULL UNIQUE,
  product_model_id VARCHAR(30) NOT NULL REFERENCES product_models(product_model_id),
  bom_version_id VARCHAR(40) NOT NULL REFERENCES bom_versions(bom_version_id),
  manufacturing_site VARCHAR(80) NOT NULL,
  line_code VARCHAR(40) NOT NULL,
  order_status VARCHAR(30) NOT NULL CHECK (order_status IN ('planned', 'in_process', 'completed', 'closed', 'cancelled')),
  planned_quantity INTEGER NOT NULL CHECK (planned_quantity > 0),
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE production_order_lot_consumption (
  consumption_id VARCHAR(50) PRIMARY KEY,
  production_order_id VARCHAR(40) NOT NULL REFERENCES production_orders(production_order_id),
  supplier_lot_id VARCHAR(40) NOT NULL REFERENCES supplier_lots(supplier_lot_id),
  material_id VARCHAR(30) NOT NULL REFERENCES materials(material_id),
  consumed_quantity NUMERIC(14, 3) NOT NULL CHECK (consumed_quantity > 0),
  consumed_at TIMESTAMP NOT NULL,
  consumption_source VARCHAR(30) NOT NULL CHECK (consumption_source IN ('mes_scan', 'weigh_scale', 'inventory_issue', 'manual_adjustment')),
  UNIQUE (production_order_id, supplier_lot_id, material_id)
);

CREATE TABLE serialized_units (
  serial_number VARCHAR(50) PRIMARY KEY,
  production_order_id VARCHAR(40) NOT NULL REFERENCES production_orders(production_order_id),
  product_model_id VARCHAR(30) NOT NULL REFERENCES product_models(product_model_id),
  bom_version_id VARCHAR(40) NOT NULL REFERENCES bom_versions(bom_version_id),
  completed_at TIMESTAMP NOT NULL,
  unit_status VARCHAR(30) NOT NULL CHECK (unit_status IN ('built', 'released', 'shipped', 'held', 'scrapped', 'returned')),
  final_quality_disposition VARCHAR(30) NOT NULL CHECK (final_quality_disposition IN ('pending', 'accepted', 'rework_required', 'rejected')),
  UNIQUE (production_order_id, serial_number)
);

CREATE TABLE inspections (
  inspection_id VARCHAR(50) PRIMARY KEY,
  serial_number VARCHAR(50) NOT NULL REFERENCES serialized_units(serial_number),
  production_order_id VARCHAR(40) NOT NULL REFERENCES production_orders(production_order_id),
  inspection_type VARCHAR(30) NOT NULL CHECK (inspection_type IN ('incoming', 'in_process', 'final', 'audit', 'return_analysis')),
  performed_at TIMESTAMP NOT NULL,
  station_code VARCHAR(40) NOT NULL,
  inspector_id VARCHAR(40) NOT NULL,
  inspection_status VARCHAR(30) NOT NULL CHECK (inspection_status IN ('passed', 'failed', 'conditional')),
  first_pass_flag INTEGER NOT NULL CHECK (first_pass_flag IN (0, 1))
);

CREATE TABLE inspection_defects (
  defect_id VARCHAR(50) PRIMARY KEY,
  inspection_id VARCHAR(50) NOT NULL REFERENCES inspections(inspection_id),
  serial_number VARCHAR(50) NOT NULL REFERENCES serialized_units(serial_number),
  production_order_id VARCHAR(40) NOT NULL REFERENCES production_orders(production_order_id),
  defect_code VARCHAR(40) NOT NULL,
  defect_category VARCHAR(60) NOT NULL,
  severity_level VARCHAR(30) NOT NULL CHECK (severity_level IN ('minor', 'major', 'critical')),
  related_supplier_lot_id VARCHAR(40) REFERENCES supplier_lots(supplier_lot_id),
  defect_disposition VARCHAR(30) NOT NULL CHECK (defect_disposition IN ('use_as_is', 'rework', 'scrap', 'supplier_chargeback', 'under_review')),
  rework_hours NUMERIC(10, 2) NOT NULL CHECK (rework_hours >= 0),
  detected_at TIMESTAMP NOT NULL
);

CREATE TABLE shipments (
  shipment_id VARCHAR(40) PRIMARY KEY,
  shipment_number VARCHAR(50) NOT NULL UNIQUE,
  shipped_at TIMESTAMP NOT NULL,
  customer_account_id VARCHAR(40) NOT NULL,
  destination_region VARCHAR(80) NOT NULL,
  destination_country_code VARCHAR(2) NOT NULL,
  carrier_name VARCHAR(80) NOT NULL,
  shipment_status VARCHAR(30) NOT NULL CHECK (shipment_status IN ('planned', 'shipped', 'delivered', 'returned'))
);

CREATE TABLE shipment_units (
  shipment_unit_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(40) NOT NULL REFERENCES shipments(shipment_id),
  serial_number VARCHAR(50) NOT NULL REFERENCES serialized_units(serial_number),
  shipped_unit_status VARCHAR(30) NOT NULL CHECK (shipped_unit_status IN ('released', 'exception_approved', 'replacement', 'returned')),
  UNIQUE (shipment_id, serial_number)
);

CREATE TABLE warranty_claims (
  warranty_claim_id VARCHAR(50) PRIMARY KEY,
  serial_number VARCHAR(50) NOT NULL REFERENCES serialized_units(serial_number),
  claim_number VARCHAR(60) NOT NULL UNIQUE,
  claim_opened_at TIMESTAMP NOT NULL,
  failure_code VARCHAR(40) NOT NULL,
  failure_category VARCHAR(80) NOT NULL,
  claim_status VARCHAR(30) NOT NULL CHECK (claim_status IN ('opened', 'approved', 'rejected', 'closed')),
  claim_cost_amount NUMERIC(12, 2) NOT NULL CHECK (claim_cost_amount >= 0),
  service_region VARCHAR(80) NOT NULL
);

CREATE TABLE recall_campaigns (
  recall_campaign_id VARCHAR(40) PRIMARY KEY,
  campaign_code VARCHAR(40) NOT NULL UNIQUE,
  campaign_name VARCHAR(160) NOT NULL,
  initiated_at TIMESTAMP NOT NULL,
  campaign_status VARCHAR(30) NOT NULL CHECK (campaign_status IN ('draft', 'active', 'closed')),
  scope_rule_description VARCHAR(400) NOT NULL,
  regulatory_report_required INTEGER NOT NULL CHECK (regulatory_report_required IN (0, 1))
);

CREATE TABLE recall_affected_units (
  recall_unit_id VARCHAR(60) PRIMARY KEY,
  recall_campaign_id VARCHAR(40) NOT NULL REFERENCES recall_campaigns(recall_campaign_id),
  serial_number VARCHAR(50) NOT NULL REFERENCES serialized_units(serial_number),
  traced_supplier_lot_id VARCHAR(40) REFERENCES supplier_lots(supplier_lot_id),
  scope_reason VARCHAR(80) NOT NULL,
  affected_status VARCHAR(30) NOT NULL CHECK (affected_status IN ('identified', 'notified', 'remediated', 'excluded')),
  identified_at TIMESTAMP NOT NULL,
  UNIQUE (recall_campaign_id, serial_number)
);
