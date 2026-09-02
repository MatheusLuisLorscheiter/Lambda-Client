#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_ENV = new Set(['.env.example', '.env.sample', '.env.template']);
const SECRET_PATTERNS = [
  ['chave privada PEM', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['GitHub token', /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{30,}\b/],
  ['Stripe secret key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
];

function trackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Não foi possível listar os arquivos rastreados pelo Git.');
  return result.stdout.split('\0').filter(Boolean);
}

function isBinary(buffer) {
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function scan(files) {
  const findings = [];
  for (const file of files) {
    const basename = path.basename(file).toLowerCase();
    if (/^\.env(?:\..+)?$/i.test(basename) && !ALLOWED_ENV.has(basename)) {
      findings.push({ file, reason: 'arquivo .env rastreado' });
      continue;
    }
    if (file.split(/[\\/]/u).includes('node_modules')) continue;
    const absolute = path.resolve(ROOT, file);
    if (!absolute.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(absolute)) continue;
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_BYTES) continue;
    const buffer = fs.readFileSync(absolute);
    if (isBinary(buffer)) continue;
    const content = buffer.toString('utf8');
    for (const [reason, pattern] of SECRET_PATTERNS) {
      if (pattern.test(content)) findings.push({ file, reason });
    }
  }
  return findings;
}

function main() {
  const files = trackedFiles();
  const findings = scan(files);
  if (findings.length) {
    console.error('Possíveis segredos em arquivos rastreados:');
    for (const finding of findings) console.error(`- ${finding.file}: ${finding.reason}`);
    console.error('O conteúdo não foi exibido. Remova-o do Git e rotacione a credencial.');
    process.exitCode = 1;
    return;
  }
  console.log(`Varredura concluída: ${files.length} arquivos rastreados, sem segredo de alta confiança.`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { scan };
