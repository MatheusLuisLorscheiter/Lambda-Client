const MAX_VALUE_PREVIEW = 5000;

const jsonValue = (value) => {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

const comparable = (value) => JSON.stringify(jsonValue(value));

const summarizeDocument = (value) => {
  const text = String(value || '');
  return {
    length: text.length,
    lines: text ? text.split(/\r?\n/).length : 0,
    preview: text.trim().slice(0, 180)
  };
};

const buildChangedFields = (beforeData = {}, afterData = {}, fieldNames = null) => {
  const keys = fieldNames || [...new Set([
    ...Object.keys(beforeData || {}),
    ...Object.keys(afterData || {})
  ])];

  return keys
    .filter((field) => comparable(beforeData?.[field]) !== comparable(afterData?.[field]))
    .map((field) => field === 'contentMarkdown'
      ? {
          field,
          before: summarizeDocument(beforeData?.[field]),
          after: summarizeDocument(afterData?.[field])
        }
      : {
          field,
          before: jsonValue(beforeData?.[field]),
          after: jsonValue(afterData?.[field])
        });
};

const trimSnapshot = (value) => {
  if (!value || typeof value !== 'object') return value ?? null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (typeof item === 'string' && item.length > MAX_VALUE_PREVIEW && key !== 'contentMarkdown') {
      return [key, `${item.slice(0, MAX_VALUE_PREVIEW)}…`];
    }
    return [key, item];
  }));
};

const recordMappingChange = async ({
  db,
  mappingSetId,
  actorUserId,
  actorRole,
  action,
  entityType,
  entityId = null,
  summary,
  beforeData = null,
  afterData = null,
  changedFields = null,
  mappingRevision,
  clientVisible = true
}) => {
  const effectiveChangedFields = changedFields || buildChangedFields(beforeData || {}, afterData || {});
  const result = await db.query(
    `INSERT INTO integration_mapping_changes
      (mapping_set_id, actor_user_id, actor_role, action, entity_type, entity_id,
       summary, changed_fields, before_data, after_data, mapping_revision, client_visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, created_at AS "createdAt"`,
    [
      mappingSetId,
      actorUserId || null,
      actorRole || 'system',
      action,
      entityType,
      entityId == null ? null : String(entityId),
      summary,
      JSON.stringify(effectiveChangedFields),
      beforeData ? JSON.stringify(trimSnapshot(beforeData)) : null,
      afterData ? JSON.stringify(trimSnapshot(afterData)) : null,
      mappingRevision,
      Boolean(clientVisible)
    ]
  );
  return result.rows[0];
};

module.exports = {
  buildChangedFields,
  recordMappingChange
};
