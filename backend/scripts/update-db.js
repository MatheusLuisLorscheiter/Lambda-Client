// node "c:\Users\Mathe\OneDrive\Área de Trabalho\System\Projetos Concluídos\Lambda-Client\backend\scripts\update-db.js"

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não encontrado no .env');
    process.exit(1);
}

if (!fs.existsSync(schemaPath)) {
    console.error(`schema.sql não encontrado em ${schemaPath}`);
    process.exit(1);
}

const run = async () => {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const migrations = [
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS memory_mb INTEGER NOT NULL DEFAULT 128',
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS show_cost_estimate BOOLEAN NOT NULL DEFAULT TRUE',
        "ALTER TABLE integrations ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active'",
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_check_status TEXT',
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_check_message TEXT',
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ',
        "ALTER TABLE integrations ADD COLUMN IF NOT EXISTS documentation_links JSONB NOT NULL DEFAULT '[]'",
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS metadata_version INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS aws_connection_id INTEGER REFERENCES aws_connections(id) ON DELETE RESTRICT',
        'ALTER TABLE integrations ALTER COLUMN access_key_encrypted DROP NOT NULL',
        'ALTER TABLE integrations ALTER COLUMN secret_key_encrypted DROP NOT NULL',
        'CREATE INDEX IF NOT EXISTS idx_integrations_aws_connection ON integrations(aws_connection_id)',
        'ALTER TABLE aws_connections ADD COLUMN IF NOT EXISTS access_key_hint TEXT',
        "UPDATE aws_connections SET access_key_hint = '****' WHERE access_key_hint IS NULL",
        'ALTER TABLE aws_connections ALTER COLUMN access_key_hint SET NOT NULL',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_connection_function ON integrations(company_id, aws_connection_id, region, function_name) WHERE aws_connection_id IS NOT NULL',
        'CREATE INDEX IF NOT EXISTS idx_aws_connections_owner ON aws_connections(owner_user_id, updated_at DESC)',
        'ALTER TABLE aws_connections ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE',
        'CREATE INDEX IF NOT EXISTS idx_aws_connections_company ON aws_connections(company_id, updated_at DESC)',
        'CREATE INDEX IF NOT EXISTS idx_lambda_source_revisions_integration ON lambda_source_revisions(integration_id, revision DESC)',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS reference_code TEXT',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS objective TEXT',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS scope TEXT',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT',
        "ALTER TABLE process_items ADD COLUMN IF NOT EXISTS impact TEXT NOT NULL DEFAULT 'medium'",
        "ALTER TABLE process_items ADD COLUMN IF NOT EXISTS health TEXT NOT NULL DEFAULT 'on_track'",
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS target_sla_at TIMESTAMPTZ',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS blocked_reason TEXT',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS next_action TEXT',
        "ALTER TABLE process_items ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'",
        "ALTER TABLE process_items ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'",
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS client_can_comment BOOLEAN NOT NULL DEFAULT TRUE',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS client_can_manage_effort BOOLEAN NOT NULL DEFAULT TRUE',
        "ALTER TABLE process_items ADD COLUMN IF NOT EXISTS client_editable_fields JSONB NOT NULL DEFAULT '[]'",
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS is_client_visible BOOLEAN NOT NULL DEFAULT TRUE',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ',
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE process_checklist_items ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE process_deliveries ADD COLUMN IF NOT EXISTS row_version INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES process_updates(id) ON DELETE SET NULL',
        "ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'update'",
        "ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'client'",
        "ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'",
        'ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ',
        'ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS content_markdown TEXT',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ',
        "ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS client_edit_mode TEXT NOT NULL DEFAULT 'none'",
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS client_can_add_entries BOOLEAN NOT NULL DEFAULT FALSE',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS client_can_delete_entries BOOLEAN NOT NULL DEFAULT FALSE',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS client_instructions TEXT',
        `ALTER TABLE integration_mapping_sets
           ADD COLUMN IF NOT EXISTS validation_rules JSONB NOT NULL DEFAULT '{
             "requireStructuredEntries": false,
             "blockUnresolved": false,
             "blockDuplicateSources": false,
             "requireTypes": false
           }'`,
        "ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'not_requested'",
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS approval_revision INTEGER',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS approval_note TEXT',
        `DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1
                FROM information_schema.columns
               WHERE table_schema = current_schema()
                 AND table_name = 'integration_mapping_sets'
                 AND column_name = 'revision'
            ) THEN
              ALTER TABLE integration_mapping_sets ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
              UPDATE integration_mapping_sets SET revision = version;
              WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                         PARTITION BY integration_id, name
                         ORDER BY created_at, id
                       ) AS semantic_version
                  FROM integration_mapping_sets
              )
              UPDATE integration_mapping_sets
                 SET version = ranked.semantic_version
                FROM ranked
               WHERE integration_mapping_sets.id = ranked.id;
            END IF;
          END $$;`,
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS cloned_from_mapping_set_id INTEGER REFERENCES integration_mapping_sets(id) ON DELETE SET NULL',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS last_client_edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS last_client_edited_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS last_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS section TEXT',
        "ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS mapping_status TEXT NOT NULL DEFAULT 'mapped'",
        "ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS client_editable_fields JSONB NOT NULL DEFAULT '[]'",
        'ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS last_client_edited_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
        'ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS last_client_edited_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_changes ADD COLUMN IF NOT EXISTS audit_log_id INTEGER REFERENCES audit_logs(id) ON DELETE SET NULL',
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_sets
                    ADD CONSTRAINT chk_mapping_client_edit_mode
                    CHECK (client_edit_mode IN ('none', 'all', 'selected'));
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_sets
                    ADD CONSTRAINT chk_mapping_revision_positive
                    CHECK (revision > 0);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_sets
                    ADD CONSTRAINT chk_mapping_approval_status
                    CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'rejected'));
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_sets
                    ADD CONSTRAINT chk_mapping_approval_revision_positive
                    CHECK (approval_revision IS NULL OR approval_revision > 0);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_changes DROP CONSTRAINT IF EXISTS integration_mapping_changes_action_check;
                    ALTER TABLE integration_mapping_changes
                    ADD CONSTRAINT integration_mapping_changes_action_check
                    CHECK (action IN (
                      'create', 'update', 'delete', 'publish', 'archive', 'clone', 'upload',
                      'review', 'review_request', 'comment', 'restore', 'bulk_import', 'bulk_update'
                    ));
                END $$;`,
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_entries
                    ADD CONSTRAINT chk_mapping_entry_status
                    CHECK (mapping_status IN ('mapped', 'pending', 'attention', 'ignored'));
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        "UPDATE process_items SET reference_code = 'LP-' || LPAD(id::text, 6, '0') WHERE reference_code IS NULL",
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_process_reference_code ON process_items(reference_code)',
        'CREATE INDEX IF NOT EXISTS idx_process_items_visibility ON process_items(company_id, archived_at, is_client_visible)',
        'CREATE INDEX IF NOT EXISTS idx_process_effort_assessments ON process_effort_assessments(process_id, stage, measured_at DESC, id DESC)',
        'CREATE INDEX IF NOT EXISTS idx_process_effort_items ON process_effort_items(assessment_id, sort_order, id)',
        'ALTER TABLE process_effort_items ADD COLUMN IF NOT EXISTS working_days_per_month NUMERIC(5, 2) NOT NULL DEFAULT 22',
        `DO $$ BEGIN
                    ALTER TABLE process_effort_items
                    ADD CONSTRAINT chk_process_effort_working_days
                    CHECK (working_days_per_month > 0 AND working_days_per_month <= 31);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        'CREATE INDEX IF NOT EXISTS idx_mapping_sets_client_visibility ON integration_mapping_sets(company_id, integration_id, status)',
        'CREATE INDEX IF NOT EXISTS idx_mapping_sets_approval ON integration_mapping_sets(company_id, approval_status, updated_at DESC)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_sets_semantic_version ON integration_mapping_sets(integration_id, name, version)',
        'CREATE INDEX IF NOT EXISTS idx_mapping_changes_set ON integration_mapping_changes(mapping_set_id, created_at DESC, id DESC)',
        'CREATE INDEX IF NOT EXISTS idx_mapping_changes_actor ON integration_mapping_changes(actor_user_id, created_at DESC)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_changes_audit_log ON integration_mapping_changes(audit_log_id)',
        `WITH client_edits AS (
            SELECT mapping_set_id, last_client_edited_by AS user_id, last_client_edited_at AS edited_at
              FROM integration_mapping_entries
             WHERE last_client_edited_at IS NOT NULL
            UNION ALL
            SELECT audit_logs.resource_id::integer AS mapping_set_id,
                   audit_logs.user_id,
                   audit_logs.created_at
              FROM audit_logs
             WHERE audit_logs.action = 'mapping.client.document.update'
               AND audit_logs.resource_id ~ '^[0-9]+$'
          ),
          latest AS (
            SELECT DISTINCT ON (mapping_set_id) mapping_set_id, user_id, edited_at
              FROM client_edits
             ORDER BY mapping_set_id, edited_at DESC
          )
          UPDATE integration_mapping_sets
             SET last_client_edited_by = latest.user_id,
                 last_client_edited_at = latest.edited_at
            FROM latest
           WHERE integration_mapping_sets.id = latest.mapping_set_id
             AND (
               integration_mapping_sets.last_client_edited_at IS NULL
               OR integration_mapping_sets.last_client_edited_at < latest.edited_at
             )`,
        `INSERT INTO integration_mapping_changes
            (audit_log_id, mapping_set_id, actor_user_id, actor_role, action, entity_type,
             entity_id, summary, changed_fields, mapping_revision, client_visible, created_at)
         SELECT audit_logs.id,
                mapping_sets.id,
                audit_logs.user_id,
                COALESCE(users.role, 'system'),
                CASE
                  WHEN audit_logs.action LIKE '%.bulk_import' THEN 'bulk_import'
                  WHEN audit_logs.action LIKE '%.create' THEN 'create'
                  WHEN audit_logs.action LIKE '%.update' THEN 'update'
                  WHEN audit_logs.action LIKE '%.delete' THEN 'delete'
                  WHEN audit_logs.action LIKE '%.archive' THEN 'archive'
                  WHEN audit_logs.action LIKE '%.clone' THEN 'clone'
                  WHEN audit_logs.action LIKE '%.upload' THEN 'upload'
                  ELSE 'update'
                END,
                CASE audit_logs.resource_type
                  WHEN 'mapping_entry' THEN 'mapping_entry'
                  ELSE 'mapping_set'
                END,
                audit_logs.resource_id,
                CASE
                  WHEN audit_logs.action = 'mapping.client.document.update' THEN 'Cliente atualizou o documento'
                  WHEN audit_logs.action = 'mapping.client.entry.update' THEN 'Cliente atualizou um vínculo'
                  WHEN audit_logs.action = 'mapping.client.entry.create' THEN 'Cliente adicionou um vínculo'
                  WHEN audit_logs.action = 'mapping.client.entry.delete' THEN 'Cliente excluiu um vínculo'
                  WHEN audit_logs.action = 'mapping.archive' THEN 'Mapeamento arquivado'
                  WHEN audit_logs.action = 'mapping.clone' THEN 'Nova versão criada'
                  WHEN audit_logs.action = 'mapping.attachment.upload' THEN 'Arquivo anexado'
                  WHEN audit_logs.action = 'mapping.attachment.delete' THEN 'Arquivo removido'
                  WHEN audit_logs.action = 'mapping.entry.bulk_import' THEN 'Vínculos importados'
                  WHEN audit_logs.action = 'mapping.create' THEN 'Mapeamento criado'
                  ELSE 'Mapeamento atualizado'
                END,
                '[]'::jsonb,
                1,
                TRUE,
                audit_logs.created_at
           FROM audit_logs
           LEFT JOIN users ON users.id = audit_logs.user_id
           JOIN integration_mapping_sets mapping_sets
             ON mapping_sets.id = CASE
               WHEN audit_logs.resource_type = 'mapping_set'
                 THEN CASE WHEN audit_logs.resource_id ~ '^[0-9]+$' THEN audit_logs.resource_id::integer END
               ELSE CASE WHEN COALESCE(audit_logs.metadata->>'mappingSetId', '') ~ '^[0-9]+$'
                 THEN (audit_logs.metadata->>'mappingSetId')::integer END
             END
          WHERE audit_logs.action LIKE 'mapping.%'
         ON CONFLICT (audit_log_id) DO NOTHING`,
        `WITH ranked AS (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY position NULLS LAST, created_at, id) AS next_position
            FROM process_items
            WHERE status = 'queued'
         )
         UPDATE process_items
            SET position = ranked.next_position
           FROM ranked
          WHERE process_items.id = ranked.id`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_process_queue_position
            ON process_items(company_id, position)
         WHERE status = 'queued' AND position IS NOT NULL`,
        'ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL',
        `DO $$ BEGIN
                    ALTER TABLE users ADD CONSTRAINT chk_clients_have_company CHECK (role <> 'client' OR company_id IS NOT NULL);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_admin_email ON users(email) WHERE company_id IS NULL',
        `CREATE TABLE IF NOT EXISTS company_mcp_configs (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
          is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          api_key_hash TEXT,
          api_key_prefix TEXT,
          allowed_domains JSONB NOT NULL DEFAULT '{"logs": true, "processes": true, "mappings": true, "integrations": true}',
          access_mode TEXT NOT NULL DEFAULT 'company' CONSTRAINT chk_company_mcp_access_mode CHECK (access_mode IN ('company', 'delegated')),
          require_contact_tag_match BOOLEAN NOT NULL DEFAULT FALSE,
          max_requests_per_minute INTEGER NOT NULL DEFAULT 60,
          last_accessed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`,
        "ALTER TABLE company_mcp_configs ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'company'",
        "ALTER TABLE company_mcp_configs ADD COLUMN IF NOT EXISTS allowed_scopes TEXT[] NOT NULL DEFAULT '{}'",
        'ALTER TABLE company_mcp_configs ADD COLUMN IF NOT EXISTS require_contact_tag_match BOOLEAN NOT NULL DEFAULT FALSE',
        `DO $$ BEGIN
          ALTER TABLE company_mcp_configs ADD CONSTRAINT chk_company_mcp_access_mode CHECK (access_mode IN ('company', 'delegated'));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        'CREATE INDEX IF NOT EXISTS idx_company_mcp_configs_company ON company_mcp_configs(company_id)',
        `CREATE TABLE IF NOT EXISTS company_mcp_access_grants (
          id SERIAL PRIMARY KEY,
          principal_company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          target_company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (principal_company_id, target_company_id),
          CHECK (principal_company_id <> target_company_id)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_company_mcp_access_grants_principal ON company_mcp_access_grants(principal_company_id, is_active)',
        `CREATE TABLE IF NOT EXISTS company_mcp_contact_emails (
          id SERIAL PRIMARY KEY,
          company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          label TEXT,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (company_id, email),
          CHECK (email = LOWER(BTRIM(email))),
          CHECK (CHAR_LENGTH(email) BETWEEN 3 AND 320),
          CHECK (label IS NULL OR CHAR_LENGTH(label) <= 120)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_company_mcp_contact_emails_active ON company_mcp_contact_emails(company_id, email) WHERE is_active = TRUE'
    ];
    const dataMigrations = [
        {
            key: '20260905_pincbar_controladoria_mcp_contact',
            statement: `
              DO $$
              DECLARE
                target_company_id INTEGER;
              BEGIN
                SELECT id
                  INTO target_company_id
                  FROM companies
                 WHERE LOWER(BTRIM(name)) = 'pincbar'
                 ORDER BY id
                 LIMIT 1;

                IF target_company_id IS NULL THEN
                  RAISE EXCEPTION 'Empresa PincBar não encontrada para a migração de contato MCP';
                END IF;

                INSERT INTO company_mcp_contact_emails
                  (company_id, email, label, is_active, created_by, revoked_by, updated_at)
                VALUES
                  (target_company_id, 'controladoria@pincbar.com.br', 'Luana — Controladoria', TRUE, NULL, NULL, NOW())
                ON CONFLICT (company_id, email) DO UPDATE
                  SET label = EXCLUDED.label,
                      is_active = TRUE,
                      revoked_by = NULL,
                      updated_at = NOW();
              END $$;
            `
        }
    ];

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Evita que duas instâncias executem a migração ao mesmo tempo.
        // O PostgreSQL libera o lock automaticamente ao finalizar a transação.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('lambda-client-schema-migration'))");
        await client.query(sql);

        for (const statement of migrations) {
            await client.query(statement);
        }

        for (const migration of dataMigrations) {
            const alreadyApplied = await client.query(
                'SELECT 1 FROM app_data_migrations WHERE migration_key = $1',
                [migration.key]
            );
            if (alreadyApplied.rowCount > 0) continue;

            await client.query(migration.statement);
            await client.query(
                'INSERT INTO app_data_migrations (migration_key) VALUES ($1)',
                [migration.key]
            );
        }

        await client.query('COMMIT');
        console.log('Schema aplicado com sucesso.');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
