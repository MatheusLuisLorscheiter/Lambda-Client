require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../db');

const companyName = process.argv[2];
const email = process.argv[3];
const password = process.argv[4];
const role = process.argv[5] || 'admin';

if (!companyName || !email || !password) {
    console.error('Usage: node scripts/create-user.js <companyName> <email> <password> [admin|client]');
    process.exit(1);
}

const run = async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    const companyResult = await query(
        'INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name',
        [companyName]
    );

    const companyId = companyResult.rows[0].id;

    const result = await query(
        'INSERT INTO users (company_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role, company_id',
        [companyId, email, passwordHash, role]
    );

    console.log('Created user:', result.rows[0]);
    await pool.end();
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
