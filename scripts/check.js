'use strict';
// Vérifie la syntaxe de tous les fichiers JavaScript du projet (npm run check).

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = ['src', 'public', 'tests', 'scripts'];
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
}
for (const d of DIRS) if (fs.existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d));

let failed = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) { failed += 1; process.stderr.write(r.stderr); }
}
console.log(`${files.length - failed}/${files.length} fichiers JavaScript valides.`);
process.exit(failed ? 1 : 0);
