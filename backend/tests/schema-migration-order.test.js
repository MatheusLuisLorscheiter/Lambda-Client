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

test('cria conexões AWS e revisões de fonte antes das migrações incrementais', () => {
  const root = path.resolve(__dirname, '..');
  const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'scripts', 'update-db.js'), 'utf8');
  assert.ok(schema.indexOf('CREATE TABLE IF NOT EXISTS aws_connections') < schema.indexOf('CREATE TABLE IF NOT EXISTS integrations'));
  assert.ok(schema.includes('CREATE TABLE IF NOT EXISTS lambda_source_revisions'));
  assert.doesNotMatch(schema, /CREATE INDEX IF NOT EXISTS idx_integrations_aws_connection/);
  assert.doesNotMatch(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_connection_function/);
  assert.ok(migration.includes('ALTER TABLE integrations ADD COLUMN IF NOT EXISTS aws_connection_id'));
  assert.ok(migration.includes('ALTER TABLE integrations ALTER COLUMN access_key_encrypted DROP NOT NULL'));
  assert.ok(migration.indexOf('CREATE INDEX IF NOT EXISTS idx_integrations_aws_connection') > migration.indexOf('ADD COLUMN IF NOT EXISTS aws_connection_id'));
});
