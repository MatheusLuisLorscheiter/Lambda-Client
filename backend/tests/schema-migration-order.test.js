const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('cria o índice de aprovação somente depois de adicionar a coluna em bases existentes', () => {
  const root = path.resolve(__dirname, '..');
  const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'scripts', 'update-db.js'), 'utf8');

  assert.doesNotMatch(
    schema,
    /CREATE INDEX IF NOT EXISTS idx_mapping_sets_approval/u,
    'O schema base roda antes das migrações incrementais e não pode indexar uma coluna ainda ausente.',
  );
  const addColumn = migration.indexOf('ADD COLUMN IF NOT EXISTS approval_status');
  const createIndex = migration.indexOf('CREATE INDEX IF NOT EXISTS idx_mapping_sets_approval');
  assert.ok(addColumn >= 0, 'A migração precisa criar approval_status.');
  assert.ok(createIndex > addColumn, 'O índice deve ser criado depois da coluna.');
});
