'use strict';
const { Pool } = require('pg');
const config = require('./config');
const log = require('./lib/log');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (err) => log.error('pg pool error', { err: err.message }));
  }
  return pool;
}

// Pour les tests : utiliser une base précise.
function setPool(p) {
  pool = p;
}

function query(text, params) {
  return getPool().query(text, params);
}

// Erreurs transitoires de concurrence : la transaction peut être rejouée sans risque.
const RETRYABLE = new Set(['40P01', '40001']); // deadlock_detected, serialization_failure

// Exécute fn(client) dans une transaction. Annule tout en cas d'erreur.
// `retries` : nombre de nouvelles tentatives sur erreur transitoire (fn ne doit toucher qu'à la base).
async function withTx(fn, { isolation, retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await getPool().connect();
    try {
      await client.query(isolation ? `BEGIN ISOLATION LEVEL ${isolation}` : 'BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connexion déjà perdue */ }
      if (attempt < retries && RETRYABLE.has(err.code)) {
        log.warn('transaction rejouée', { code: err.code, attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (attempt + 1)));
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

async function close() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

module.exports = { getPool, setPool, query, withTx, close };
