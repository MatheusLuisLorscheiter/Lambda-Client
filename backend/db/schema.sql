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
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'automation'
    CHECK (category IN ('automation', 'integration', 'maintenance', 'improvement', 'support')),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'analysis', 'queued', 'in_progress', 'validation', 'delivered', 'paused', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  position INTEGER,
  complexity TEXT
    CHECK (complexity IS NULL OR complexity IN ('simple', 'medium', 'complex')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  estimate_business_days INTEGER CHECK (estimate_business_days IS NULL OR estimate_business_days > 0),
  planned_start DATE,
  due_date DATE,
  delivered_at TIMESTAMPTZ,
  latest_update TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
