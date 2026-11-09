'use strict';
// Applique les migrations SQL de /migrations dans l'ordre, une seule fois chacune.
// Un verrou consultatif empêche deux instances de migrer en même temps.

const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const log = require('./lib/log');

const DIR = path.join(__dirname, '..', 'migrations');
const LOCK_ID = 7262026;

async function migrate() {
  const client = await db.getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log.info('migration appliquée', { file });
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} échouée : ${err.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .then(() => { log.info('migrations à jour'); return db.close(); })
    .catch((err) => { log.error('échec des migrations', { err: err.message }); process.exit(1); });
}
