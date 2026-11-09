'use strict';
// Base de test : TEST_DATABASE_URL (CI GitHub, service postgres) ou PostgreSQL embarqué (poste local).

process.env.LOG_SILENT = 'true';
process.env.RATE_LIMIT_DISABLED = 'true';
process.env.PAYMENT_PROVIDER = process.env.PAYMENT_PROVIDER || 'demo';
process.env.MIGRATE_ON_BOOT = 'false';

const path = require('node:path');
const fs = require('node:fs');
const { Pool } = require('pg');

let embedded = null;
let dataDir = null;

async function setupDb() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const EmbeddedPostgres = require('embedded-postgres').default;
    const port = 54100 + (process.pid % 800);
    dataDir = path.join(__dirname, `.pgdata-${process.pid}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
    embedded = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'postgres', port, persistent: true, onLog: () => {}, onError: () => {} });
    await embedded.initialise();
    await embedded.start();
    await embedded.createDatabase('ocdtest');
    url = `postgres://postgres:postgres@localhost:${port}/ocdtest`;
  }
  process.env.DATABASE_URL = url;
  const db = require('../src/db');
  const pool = new Pool({ connectionString: url, max: 20 });
  db.setPool(pool);
  await pool.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await require('../src/migrate').migrate();
  // Les tests réservent à partir d'aujourd'hui, quelle que soit la date du jour.
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(`UPDATE settings SET value = value || $1 WHERE key = 'booking'`, [{ launchDate: today, leadMin: 0 }]);
  require('../src/lib/settings').clearCache();
  return { db, pool };
}

// Arrêt propre via pg_ctl (sous Windows, l'arrêt d'embedded-postgres laisse des processus orphelins).
function pgCtlStop() {
  const plat = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const bin = path.join(__dirname, '..', 'node_modules', '@embedded-postgres', plat, 'native', 'bin', process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  if (!fs.existsSync(bin)) return false;
  require('node:child_process').execFileSync(bin, ['stop', '-D', dataDir, '-m', 'fast', '-w', '-t', '30'], { stdio: 'ignore', timeout: 40000 });
  return true;
}

async function teardown() {
  await require('../src/db').close();
  if (embedded) {
    let stopped = false;
    try { stopped = pgCtlStop(); } catch (_) { /* repli ci-dessous */ }
    if (!stopped) await Promise.race([embedded.stop().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  }
  if (dataDir) {
    try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (_) { /* Windows : fichiers encore verrouillés */ }
  }
}

// Début d'un créneau dans N jours, à HH:MM (heure de Lomé = UTC).
function slot(daysAhead, hhmm) {
  const d = new Date();
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysAhead, h, m)).toISOString();
}

const contact = (over = {}) => ({
  name: 'Mireille Ndongo', company: 'Boutique Élégance', sector: 'Mode, vêtements et chaussures',
  products: 'chaussures pour femmes', country: 'Cameroun', city: 'Douala', phone: '+237 690 00 00 01', email: 'mireille@exemple.com', ...over,
});

module.exports = { setupDb, teardown, slot, contact };
