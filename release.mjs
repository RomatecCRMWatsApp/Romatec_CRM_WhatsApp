/**
 * Script de release do Romatec CRM
 * Uso: node release.mjs 1.2.0
 *
 * O que faz:
 *  1. Atualiza version em package.json (web)
 *  2. Atualiza version em electron/package.json
 *  3. Commit + push
 *  4. Cria tag vX.Y.Z + push → dispara GitHub Actions → gera .exe automaticamente
 */

import fs from 'node:fs';
import { execSync } from 'node:child_process';

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('❌ Use: node release.mjs X.Y.Z  (ex: node release.mjs 1.2.0)');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

// ── 1. Atualiza package.json do web ───────────────────────────────────────
const webPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
webPkg.version = version;
fs.writeFileSync('package.json', JSON.stringify(webPkg, null, 2) + '\n');
console.log(`✅ package.json → v${version}`);

// ── 2. Atualiza package.json do Electron ──────────────────────────────────
const elPkg = JSON.parse(fs.readFileSync('electron/package.json', 'utf8'));
elPkg.version = version;
fs.writeFileSync('electron/package.json', JSON.stringify(elPkg, null, 2) + '\n');
console.log(`✅ electron/package.json → v${version}`);

// ── 3. Commit + push ──────────────────────────────────────────────────────
run('git add package.json electron/package.json');
run(`git commit -m "chore: release v${version}"`);
run('git push');
console.log(`✅ Commit v${version} enviado`);

// ── 4. Tag + push → GitHub Actions builda o .exe ─────────────────────────
run(`git tag v${version}`);
run(`git push origin v${version}`);
console.log(`\n🚀 Tag v${version} enviada!`);
console.log(`   GitHub Actions está compilando o instalador...`);
console.log(`   Acompanhe em: https://github.com/RomatecCRMWatsApp/Romatec_CRM_WhatsApp/actions`);
console.log(`   Download em:  https://github.com/RomatecCRMWatsApp/Romatec_CRM_WhatsApp/releases/tag/v${version}`);
