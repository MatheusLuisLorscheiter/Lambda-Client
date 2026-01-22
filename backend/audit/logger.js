const { query } = require('../db');

const logAudit = async ({
    companyId,
    userId,
    action,
    resourceType = null,
    resourceId = null,
    metadata = null,
    ipAddress = null,
    userAgent = null
}) => {
    if (!companyId || !action) {
        return;
    }

    await query(
        `INSERT INTO audit_logs
      (company_id, user_id, action, resource_type, resource_id, metadata, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)` ,
        [companyId, userId || null, action, resourceType, resourceId, metadata ? JSON.stringify(metadata) : null, ipAddress, userAgent]
    );
};

module.exports = { logAudit };
