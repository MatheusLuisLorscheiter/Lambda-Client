const path = require('path');
const AdmZip = require('adm-zip');
const { LambdaClient, GetFunctionCommand, UpdateFunctionCodeCommand } = require('@aws-sdk/client-lambda');
const { buildAwsClientCredentials } = require('./integrations');

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_EDITABLE_FILE_BYTES = 512 * 1024;
const MAX_EDITABLE_TOTAL_BYTES = 3 * 1024 * 1024;
const MAX_EDITABLE_FILES = 150;
const EDITABLE_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.py', '.rb', '.go', '.java',
  '.md', '.txt', '.yml', '.yaml', '.xml', '.html', '.css', '.scss', '.sql', '.sh', '.env.example'
]);

const lambdaClientFor = (integration) => new LambdaClient({
  region: integration.region,
  credentials: buildAwsClientCredentials(integration)
});

const normalizeArchivePath = (value) => {
  const input = String(value || '').replace(/\\/g, '/').trim();
  const normalized = path.posix.normalize(input);
  const rawSegments = input.split('/');
  if (!input || input.startsWith('/') || /^[a-zA-Z]:/.test(input) || rawSegments.includes('..') || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../') || normalized.includes('\0')) {
    const error = new Error(`Caminho de arquivo inválido: ${input || '(vazio)'}`);
    error.statusCode = 400;
    throw error;
  }
  return normalized;
};

const isEditablePath = (name) => {
  if (name.startsWith('node_modules/') || name.startsWith('.git/') || name.endsWith('/')) return false;
  const extension = path.posix.extname(name).toLowerCase();
  return EDITABLE_EXTENSIONS.has(extension) || name.endsWith('.env.example');
};

const downloadArchive = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`A AWS não disponibilizou o pacote da função (HTTP ${response.status}).`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_ARCHIVE_BYTES) throw new Error('O pacote da função excede o limite de 50 MB do editor.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('O pacote da função excede o limite de 50 MB do editor.');
  return buffer;
};

const fetchLambdaArchive = async (integration, qualifier) => {
  const client = lambdaClientFor(integration);
  const result = await client.send(new GetFunctionCommand({
    FunctionName: integration.function_name,
    ...(qualifier ? { Qualifier: qualifier } : {})
  }));
  if (!result.Code?.Location) throw new Error('A AWS não retornou o pacote de código desta função.');
  return {
    client,
    configuration: result.Configuration || {},
    archive: await downloadArchive(result.Code.Location)
  };
};

const extractEditableFiles = (archive) => {
  const zip = new AdmZip(archive);
  const files = {};
  const excluded = [];
  let totalBytes = 0;
  for (const entry of zip.getEntries()) {
    const name = normalizeArchivePath(entry.entryName);
    if (entry.isDirectory || !isEditablePath(name)) {
      if (!entry.isDirectory) excluded.push(name);
      continue;
    }
    if (Number(entry.header?.size || 0) > MAX_EDITABLE_FILE_BYTES) {
      excluded.push(name);
      continue;
    }
    const data = entry.getData();
    if (data.length > MAX_EDITABLE_FILE_BYTES || totalBytes + data.length > MAX_EDITABLE_TOTAL_BYTES || Object.keys(files).length >= MAX_EDITABLE_FILES) {
      excluded.push(name);
      continue;
    }
    const content = data.toString('utf8');
    if (content.includes('\uFFFD') || content.includes('\0')) {
      excluded.push(name);
      continue;
    }
    files[name] = content;
    totalBytes += data.length;
  }
  return { files, excluded, editableBytes: totalBytes };
};

const normalizeDraftFiles = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Arquivos do rascunho são obrigatórios.'), { statusCode: 400 });
  const entries = Object.entries(input);
  if (!entries.length || entries.length > MAX_EDITABLE_FILES) throw Object.assign(new Error('O rascunho deve conter entre 1 e 150 arquivos.'), { statusCode: 400 });
  const files = {};
  let total = 0;
  for (const [rawName, rawContent] of entries) {
    const name = normalizeArchivePath(rawName);
    if (!isEditablePath(name)) throw Object.assign(new Error(`O arquivo ${name} não é editável pelo workspace.`), { statusCode: 400 });
    if (typeof rawContent !== 'string') throw Object.assign(new Error(`Conteúdo inválido em ${name}.`), { statusCode: 400 });
    const bytes = Buffer.byteLength(rawContent, 'utf8');
    if (bytes > MAX_EDITABLE_FILE_BYTES) throw Object.assign(new Error(`O arquivo ${name} excede 512 KB.`), { statusCode: 400 });
    total += bytes;
    if (total > MAX_EDITABLE_TOTAL_BYTES) throw Object.assign(new Error('O rascunho excede 3 MB de arquivos editáveis.'), { statusCode: 400 });
    files[name] = rawContent;
  }
  return files;
};

const normalizeDeletedFiles = (input) => {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_EDITABLE_FILES) throw Object.assign(new Error('Lista de arquivos removidos inválida.'), { statusCode: 400 });
  const normalized = [...new Set(input.map(normalizeArchivePath))];
  for (const name of normalized) {
    if (!isEditablePath(name)) throw Object.assign(new Error(`O arquivo ${name} não pode ser removido pelo workspace.`), { statusCode: 400 });
  }
  return normalized;
};

const applyRevisionToArchive = ({ archive, files, deletedFiles }) => {
  const zip = new AdmZip(archive);
  for (const name of deletedFiles) zip.deleteFile(name);
  for (const [name, content] of Object.entries(files)) {
    zip.deleteFile(name);
    zip.addFile(name, Buffer.from(content, 'utf8'));
  }
  const buffer = zip.toBuffer();
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error('O pacote final excede o limite de publicação direta de 50 MB.');
  return buffer;
};

const publishSourceRevision = async ({ integration, revision }) => {
  const snapshot = await fetchLambdaArchive(integration);
  const currentHash = snapshot.configuration.CodeSha256 || '';
  if (!currentHash || currentHash !== revision.base_code_sha256) {
    const error = new Error('O código na AWS mudou depois da criação do rascunho. Recarregue a origem e crie uma nova revisão.');
    error.code = 'SOURCE_CONFLICT';
    error.statusCode = 409;
    throw error;
  }
  const archive = applyRevisionToArchive({
    archive: snapshot.archive,
    files: revision.files || {},
    deletedFiles: revision.deleted_files || []
  });
  return snapshot.client.send(new UpdateFunctionCodeCommand({
    FunctionName: integration.function_name,
    ZipFile: archive,
    Publish: true,
    RevisionId: snapshot.configuration.RevisionId
  }));
};

module.exports = {
  fetchLambdaArchive,
  extractEditableFiles,
  normalizeDraftFiles,
  normalizeDeletedFiles,
  applyRevisionToArchive,
  publishSourceRevision
};
