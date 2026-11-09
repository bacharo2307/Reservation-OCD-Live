'use strict';
// Processus worker (service Railway séparé) : `npm run worker`.

const jobs = require('./services/jobs');
const db = require('./db');
const log = require('./lib/log');
const config = require('./config');

log.info('worker démarré', { intervalMs: config.workerIntervalMs });
jobs.start();

async function shutdown(signal) {
  log.info('arrêt du worker', { signal });
  jobs.stop();
  await db.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
