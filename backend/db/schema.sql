-- PostgreSQL schema for Lambda-Client

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email),
  CHECK (role <> 'client' OR company_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  function_name TEXT NOT NULL,
  region TEXT NOT NULL,
  memory_mb INTEGER NOT NULL DEFAULT 128,
  show_cost_estimate BOOLEAN NOT NULL DEFAULT TRUE,
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'paused', 'maintenance')),
  last_check_status TEXT
    CHECK (last_check_status IS NULL OR last_check_status IN ('healthy', 'degraded', 'unavailable')),
  last_check_message TEXT,
  last_checked_at TIMESTAMPTZ,
  documentation_links JSONB NOT NULL DEFAULT '[]',
  access_key_encrypted TEXT NOT NULL,
  secret_key_encrypted TEXT NOT NULL,
  owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_items (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reference_code TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  objective TEXT,
  scope TEXT,
  acceptance_criteria TEXT,
  category TEXT NOT NULL DEFAULT 'automation'
    CHECK (category IN ('automation', 'integration', 'maintenance', 'improvement', 'support')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  impact TEXT NOT NULL DEFAULT 'medium'
    CHECK (impact IN ('low', 'medium', 'high', 'critical')),
  health TEXT NOT NULL DEFAULT 'on_track'
    CHECK (health IN ('on_track', 'at_risk', 'off_track', 'blocked')),
  position INTEGER,
  complexity TEXT
    CHECK (complexity IS NULL OR complexity IN ('simple', 'medium', 'complex')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  estimate_business_days INTEGER CHECK (estimate_business_days IS NULL OR estimate_business_days > 0),
  planned_start DATE,
  due_date DATE,
  target_sla_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  blocked_reason TEXT,
  next_action TEXT,
  tags JSONB NOT NULL DEFAULT '[]',
  custom_fields JSONB NOT NULL DEFAULT '{}',
  client_can_comment BOOLEAN NOT NULL DEFAULT TRUE,
  client_can_manage_effort BOOLEAN NOT NULL DEFAULT TRUE,
  client_editable_fields JSONB NOT NULL DEFAULT '[]',
  is_client_visible BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  latest_update TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_integrations (
  process_id INTEGER NOT NULL REFERENCES process_items(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (process_id, integration_id)
);

CREATE TABLE IF NOT EXISTS process_updates (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES process_items(id) ON DELETE CASCADE,
  author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES process_updates(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'update'
    CHECK (kind IN ('update', 'comment', 'status', 'decision', 'delivery', 'system')),
  visibility TEXT NOT NULL DEFAULT 'client'
    CHECK (visibility IN ('client', 'internal')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_checklist_items (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES process_items(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_deliveries (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES process_items(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  version TEXT,
  environment TEXT NOT NULL DEFAULT 'production'
    CHECK (environment IN ('development', 'staging', 'production')),
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('draft', 'ready', 'accepted', 'rejected')),
  artifact_links JSONB NOT NULL DEFAULT '[]',
  release_notes TEXT,
  rollback_plan TEXT,
  acceptance_note TEXT,
  delivered_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_effort_assessments (
  id SERIAL PRIMARY KEY,
  process_id INTEGER NOT NULL REFERENCES process_items(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  stage TEXT NOT NULL
    CHECK (stage IN ('baseline', 'post_automation')),
  label TEXT NOT NULL,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL DEFAULT 'estimated'
    CHECK (source IN ('estimated', 'observed', 'system')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed')),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS process_effort_items (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES process_effort_assessments(id) ON DELETE CASCADE,
  activity_name TEXT NOT NULL,
  role_name TEXT,
  execution_time_minutes NUMERIC(12, 2) NOT NULL CHECK (execution_time_minutes > 0),
  executions_per_period NUMERIC(12, 2) NOT NULL CHECK (executions_per_period > 0),
  period_unit TEXT NOT NULL
    CHECK (period_unit IN ('day', 'week', 'month', 'quarter', 'year')),
  working_days_per_month NUMERIC(5, 2) NOT NULL DEFAULT 22
    CONSTRAINT chk_process_effort_working_days
    CHECK (working_days_per_month > 0 AND working_days_per_month <= 31),
  people_count NUMERIC(10, 2) NOT NULL CHECK (people_count > 0),
  monthly_hours_per_employee NUMERIC(10, 2) NOT NULL DEFAULT 176
    CHECK (monthly_hours_per_employee > 0),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_mapping_sets (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  process_id INTEGER REFERENCES process_items(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  content_markdown TEXT,
  source_system TEXT NOT NULL,
  target_system TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  client_edit_mode TEXT NOT NULL DEFAULT 'none'
    CONSTRAINT chk_mapping_client_edit_mode CHECK (client_edit_mode IN ('none', 'all', 'selected')),
  client_can_add_entries BOOLEAN NOT NULL DEFAULT FALSE,
  client_can_delete_entries BOOLEAN NOT NULL DEFAULT FALSE,
  client_instructions TEXT,
  validation_rules JSONB NOT NULL DEFAULT '{
    "requireStructuredEntries": false,
    "blockUnresolved": false,
    "blockDuplicateSources": false,
    "requireTypes": false
  }',
  cloned_from_mapping_set_id INTEGER REFERENCES integration_mapping_sets(id) ON DELETE SET NULL,
  last_client_edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_client_edited_at TIMESTAMPTZ,
  last_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_mapping_entries (
  id SERIAL PRIMARY KEY,
  mapping_set_id INTEGER NOT NULL REFERENCES integration_mapping_sets(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  source_type TEXT,
  target_path TEXT NOT NULL,
  target_type TEXT,
  direction TEXT NOT NULL DEFAULT 'source_to_target'
    CHECK (direction IN ('source_to_target', 'target_to_source', 'bidirectional')),
  transformation TEXT,
  fallback_value TEXT,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  examples JSONB NOT NULL DEFAULT '{}',
  section TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'mapped'
    CHECK (mapping_status IN ('mapped', 'pending', 'attention', 'ignored')),
  client_editable_fields JSONB NOT NULL DEFAULT '[]',
  last_client_edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_client_edited_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_mapping_attachments (
  id SERIAL PRIMARY KEY,
  mapping_set_id INTEGER NOT NULL REFERENCES integration_mapping_sets(id) ON DELETE CASCADE,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 0 AND file_size <= 10485760),
  file_data BYTEA NOT NULL,
  extracted_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_mapping_changes (
  id BIGSERIAL PRIMARY KEY,
  audit_log_id INTEGER UNIQUE REFERENCES audit_logs(id) ON DELETE SET NULL,
  mapping_set_id INTEGER NOT NULL REFERENCES integration_mapping_sets(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('admin', 'client', 'system')),
  action TEXT NOT NULL
    CHECK (action IN (
      'create', 'update', 'delete', 'publish', 'archive', 'clone', 'upload',
      'review', 'comment', 'restore', 'bulk_import', 'bulk_update'
    )),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('mapping_set', 'mapping_entry', 'attachment', 'comment')),
  entity_id TEXT,
  summary TEXT NOT NULL,
  changed_fields JSONB NOT NULL DEFAULT '[]',
  before_data JSONB,
  after_data JSONB,
  mapping_revision INTEGER NOT NULL,
  client_visible BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_admin_email ON users(email) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_integrations_owner ON integrations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_client ON integrations(client_user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_company ON integrations(company_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_process_items_company ON process_items(company_id);
CREATE INDEX IF NOT EXISTS idx_process_items_status ON process_items(company_id, status);
CREATE INDEX IF NOT EXISTS idx_process_integrations_integration ON process_integrations(integration_id);
CREATE INDEX IF NOT EXISTS idx_process_updates_process ON process_updates(process_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_checklist_process ON process_checklist_items(process_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_process_deliveries_process ON process_deliveries(process_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_effort_assessments
  ON process_effort_assessments(process_id, stage, measured_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_process_effort_items
  ON process_effort_items(assessment_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_mapping_sets_integration ON integration_mapping_sets(integration_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mapping_entries_set ON integration_mapping_entries(mapping_set_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_mapping_attachments_set ON integration_mapping_attachments(mapping_set_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_mapping_changes_set
  ON integration_mapping_changes(mapping_set_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_mapping_changes_actor
  ON integration_mapping_changes(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS company_mcp_configs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  api_key_hash TEXT,
  api_key_prefix TEXT,
  allowed_domains JSONB NOT NULL DEFAULT '{"logs": true, "processes": true, "mappings": true, "integrations": true}',
  access_mode TEXT NOT NULL DEFAULT 'company'
    CHECK (access_mode IN ('company', 'delegated')),
  require_contact_tag_match BOOLEAN NOT NULL DEFAULT FALSE,
  max_requests_per_minute INTEGER NOT NULL DEFAULT 60,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_mcp_configs_company ON company_mcp_configs(company_id);

CREATE TABLE IF NOT EXISTS company_mcp_access_grants (
  id SERIAL PRIMARY KEY,
  principal_company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (principal_company_id, target_company_id),
  CHECK (principal_company_id <> target_company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_mcp_access_grants_principal
  ON company_mcp_access_grants(principal_company_id, is_active);
