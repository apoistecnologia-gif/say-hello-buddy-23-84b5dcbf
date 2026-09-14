import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve('.');
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.output', '.vinxi', '.tanstack', '.nitro', 'android', 'ios', 'coverage']);
const textExtensions = /(?:^|\.)(?:env(?:\.[\w.-]+)?|ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|md|sql|txt|properties)$/i;
const envFilePattern = /(^|\/)\.env(?:\..+)?$/i;
const allowedEnvExample = /(^|\/)\.env(?:\..+)?\.example$|(^|\/)\.env\.example$/i;
const sensitiveName = /(SERVICE_ROLE|PRIVATE_KEY|CLIENT_SECRET|ACCESS_TOKEN|API_SECRET|MERCADOPAGO.*(?:TOKEN|SECRET)|ASAAS.*(?:KEY|TOKEN|SECRET)|PAGBANK.*(?:TOKEN|SECRET)|OPENPIX.*(?:KEY|TOKEN|SECRET)|SAFE2PAY.*(?:KEY|TOKEN|SECRET)|CELCOIN.*(?:KEY|TOKEN|SECRET)|STRIPE.*(?:SECRET|KEY))/i;
const dangerousViteName = /\bVITE_[A-Z0-9_]*(SERVICE_ROLE|PRIVATE_KEY|CLIENT_SECRET|ACCESS_TOKEN|API_SECRET|SECRET_KEY|PAYMENT_SECRET)[A-Z0-9_]*\b/;

const signatureRules = [
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9._-]{16,}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/],
  ['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/],
  ['Mercado Pago access token', /\bAPP_USR-[A-Za-z0-9-]{20,}\b/],
];
const privateKeyMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');

function normalizedPath(path) {
  return relative(root, path).replaceAll('\\', '/');
}

function trackedFiles() {
  if (!existsSync(resolve(root, '.git'))) return null;
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const full = resolve(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile()) out.push(normalizedPath(full));
  }
  return out;
}

function looksPlaceholder(value) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  return !normalized || /placeholder|example|your[_-]|changeme|replace[_-]|dummy|xxxxx|^<.*>$/.test(normalized);
}

const files = trackedFiles() ?? walk(root);
const failures = [];
let scanned = 0;

for (const rel of files) {
  if (envFilePattern.test(rel) && !allowedEnvExample.test(rel)) {
    failures.push(`${rel}: arquivo de ambiente real não pode ser versionado`);
  }
  if (!textExtensions.test(rel) && !envFilePattern.test(rel)) continue;
  const full = resolve(root, rel);
  if (!existsSync(full)) continue;
  let source;
  try { source = readFileSync(full, 'utf8'); } catch { continue; }
  scanned += 1;

  if (source.includes(privateKeyMarker)) failures.push(`${rel}: chave privada literal encontrada`);
  for (const [label, pattern] of signatureRules) {
    if (pattern.test(source)) failures.push(`${rel}: ${label} literal encontrado`);
  }
  if (dangerousViteName.test(source)) failures.push(`${rel}: variável VITE_* com nome de credencial privilegiada encontrada`);

  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*[:=]\s*(.+?)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    if (!sensitiveName.test(name) || looksPlaceholder(rawValue)) continue;
    failures.push(`${rel}: ${name} contém valor literal de credencial privilegiada`);
  }
}

if (failures.length) {
  for (const failure of [...new Set(failures)]) console.error(`[FAIL] ${failure}`);
  process.exit(1);
}
console.log(`[OK] secret hygiene: ${scanned} arquivos de texto verificados; nenhum secret privilegiado literal encontrado.`);
console.log('[OK] VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são permitidos como configuração pública do frontend.');
