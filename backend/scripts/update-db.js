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
        'ALTER TABLE process_items ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1',
        'ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES process_updates(id) ON DELETE SET NULL',
        "ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'update'",
        "ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'client'",
        "ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'",
        'ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ',
        'ALTER TABLE process_updates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS content_markdown TEXT',
        'ALTER TABLE integration_mapping_sets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ',
        'ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS section TEXT',
        "ALTER TABLE integration_mapping_entries ADD COLUMN IF NOT EXISTS mapping_status TEXT NOT NULL DEFAULT 'mapped'",
        `DO $$ BEGIN
                    ALTER TABLE integration_mapping_entries
                    ADD CONSTRAINT chk_mapping_entry_status
                    CHECK (mapping_status IN ('mapped', 'pending', 'attention', 'ignored'));
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        "UPDATE process_items SET reference_code = 'LP-' || LPAD(id::text, 6, '0') WHERE reference_code IS NULL",
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_process_reference_code ON process_items(reference_code)',
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
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_admin_email ON users(email) WHERE company_id IS NULL'
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
