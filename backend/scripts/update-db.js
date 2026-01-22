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
    await pool.query(sql);
    const migrations = [
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS memory_mb INTEGER NOT NULL DEFAULT 128',
        'ALTER TABLE integrations ADD COLUMN IF NOT EXISTS show_cost_estimate BOOLEAN NOT NULL DEFAULT TRUE',
        "ALTER TABLE integrations ADD COLUMN IF NOT EXISTS documentation_links JSONB NOT NULL DEFAULT '[]'",
        'ALTER TABLE users ALTER COLUMN company_id DROP NOT NULL',
        `DO $$ BEGIN
                    ALTER TABLE users ADD CONSTRAINT chk_clients_have_company CHECK (role <> 'client' OR company_id IS NOT NULL);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_admin_email ON users(email) WHERE company_id IS NULL'
    ];

    for (const statement of migrations) {
        await pool.query(statement);
    }

    console.log('Schema aplicado com sucesso.');
    await pool.end();
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
