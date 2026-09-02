const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');

const {
  extractEditableFiles,
  normalizeDraftFiles,
  normalizeDeletedFiles,
  applyRevisionToArchive
} = require('../services/lambdaSource');

const buildArchive = () => {
  const zip = new AdmZip();
  zip.addFile('index.js', Buffer.from('exports.handler = async () => "antes";'));
  zip.addFile('config/settings.json', Buffer.from('{"ok":true}'));
  zip.addFile('node_modules/pkg/index.js', Buffer.from('module.exports = 1'));
  zip.addFile('asset.bin', Buffer.from([0, 1, 2, 3]));
  return zip.toBuffer();
};

test('expõe apenas fontes editáveis e preserva dependências fora do editor', () => {
  const result = extractEditableFiles(buildArchive());
  assert.equal(result.files['index.js'], 'exports.handler = async () => "antes";');
  assert.equal(result.files['config/settings.json'], '{"ok":true}');
  assert.equal(result.files['node_modules/pkg/index.js'], undefined);
  assert.ok(result.excluded.includes('node_modules/pkg/index.js'));
  assert.ok(result.excluded.includes('asset.bin'));
});

test('bloqueia traversal, caminhos absolutos e remoção de dependências', () => {
  assert.throws(() => normalizeDraftFiles({ '../index.js': 'x' }), /Caminho de arquivo inválido/);
  assert.throws(() => normalizeDraftFiles({ 'a/../index.js': 'x' }), /Caminho de arquivo inválido/);
  assert.throws(() => normalizeDraftFiles({ 'C:/index.js': 'x' }), /Caminho de arquivo inválido/);
  assert.throws(() => normalizeDeletedFiles(['node_modules/pkg/index.js']), /não pode ser removido/);
});

test('publica o overlay sem remover arquivos binários ou dependências do pacote', () => {
  const updated = applyRevisionToArchive({
    archive: buildArchive(),
    files: { 'index.js': 'exports.handler = async () => "depois";', 'new-file.js': 'module.exports = true;' },
    deletedFiles: ['config/settings.json']
  });
  const zip = new AdmZip(updated);
  assert.equal(zip.readAsText('index.js'), 'exports.handler = async () => "depois";');
  assert.equal(zip.readAsText('new-file.js'), 'module.exports = true;');
  assert.equal(zip.getEntry('config/settings.json'), null);
  assert.ok(zip.getEntry('node_modules/pkg/index.js'));
  assert.deepEqual(zip.readFile('asset.bin'), Buffer.from([0, 1, 2, 3]));
});
