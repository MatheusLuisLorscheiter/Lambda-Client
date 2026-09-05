const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw Object.assign(new Error('Informe um email válido com até 320 caracteres.'), { status: 400 });
  }
  return email;
}

function normalizeLabel(value) {
  if (value === undefined || value === null) return null;
  const label = String(value).trim();
  if (label.length > 120) {
    throw Object.assign(new Error('O rótulo deve ter no máximo 120 caracteres.'), { status: 400 });
  }
  return label || null;
}

async function getAuthorizedEmails(db, companyId) {
  const result = await db.query(`
    SELECT email
      FROM (
        SELECT LOWER(BTRIM(email)) AS email
          FROM users
         WHERE company_id = $1
           AND role = 'client'
           AND is_active = TRUE
           AND NULLIF(BTRIM(email), '') IS NOT NULL
        UNION
        SELECT LOWER(BTRIM(email)) AS email
          FROM company_mcp_contact_emails
         WHERE company_id = $1
           AND is_active = TRUE
           AND NULLIF(BTRIM(email), '') IS NOT NULL
      ) authorized
     ORDER BY email ASC
  `, [companyId]);
  return result.rows.map((row) => String(row.email)).filter(Boolean);
}

async function listAuthorizedContacts(db, companyId) {
  const result = await db.query(`
    WITH contact_sources AS (
      SELECT LOWER(BTRIM(email)) AS email, 'client_user'::text AS source,
             NULL::integer AS managed_contact_id, NULL::text AS label
        FROM users
       WHERE company_id = $1 AND role = 'client' AND is_active = TRUE
         AND NULLIF(BTRIM(email), '') IS NOT NULL
      UNION ALL
      SELECT LOWER(BTRIM(email)) AS email, 'mcp_allowlist'::text AS source,
             id AS managed_contact_id, label
        FROM company_mcp_contact_emails
       WHERE company_id = $1 AND is_active = TRUE
         AND NULLIF(BTRIM(email), '') IS NOT NULL
    )
    SELECT email,
           ARRAY_AGG(DISTINCT source ORDER BY source) AS sources,
           MAX(managed_contact_id) AS managed_contact_id,
           MAX(label) FILTER (WHERE source = 'mcp_allowlist') AS label
      FROM contact_sources
     GROUP BY email
     ORDER BY email ASC
  `, [companyId]);
  return result.rows.map((row) => ({
    email: row.email,
    sources: row.sources || [],
    managedContactId: row.managed_contact_id || null,
    label: row.label || null,
    canRevoke: Boolean(row.managed_contact_id),
  }));
}

async function authorizeContact(db, { companyId, email, label, actorUserId = null }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedLabel = normalizeLabel(label);
  const result = await db.query(`
    INSERT INTO company_mcp_contact_emails
      (company_id, email, label, is_active, created_by, revoked_by, updated_at)
    VALUES ($1, $2, $3, TRUE, $4, NULL, NOW())
    ON CONFLICT (company_id, email) DO UPDATE
      SET label = EXCLUDED.label, is_active = TRUE, revoked_by = NULL, updated_at = NOW()
    RETURNING id, company_id, email, label, is_active, created_at, updated_at
  `, [companyId, normalizedEmail, normalizedLabel, actorUserId]);
  return result.rows[0];
}

async function revokeContact(db, { companyId, contactId, actorUserId = null }) {
  const result = await db.query(`
    UPDATE company_mcp_contact_emails
       SET is_active = FALSE, revoked_by = $3, updated_at = NOW()
     WHERE id = $1 AND company_id = $2 AND is_active = TRUE
     RETURNING id, email, label, is_active, updated_at
  `, [contactId, companyId, actorUserId]);
  return result.rows[0] || null;
}

module.exports = {
  normalizeEmail,
  normalizeLabel,
  getAuthorizedEmails,
  listAuthorizedContacts,
  authorizeContact,
  revokeContact,
};
