'use strict';
// Service web : `npm start`. Sans état : sessions, verrous et tâches sont dans PostgreSQL.

const config = require('./config');
const db = require('./db');
const log = require('./lib/log');
const { createApp } = require('./app');
const { migrate } = require('./migrate');
const { bootstrapAdmin } = require('./lib/auth');
const { initSecret } = require('./lib/secret');
const jobs = require('./services/jobs');
const providers = require('./services/payments/providers');

async function main() {
  if (process.env.MIGRATE_ON_BOOT !== 'false') await migrate();
  await initSecret();
  const admin = await bootstrapAdmin();
  if (admin) log.info('super administrateur créé', { email: admin.email });

  const app = createApp();
  const server = app.listen(config.port, () => {
    log.info('OCD LIVE démarré', { port: config.port, version: config.appVersion, payment: providers.current().name, workerInWeb: config.runWorkerInWeb });
  });
  if (config.runWorkerInWeb) jobs.start();

  const shutdown = (signal) => {
    log.info('arrêt demandé', { signal });
    jobs.stop();
    server.close(async () => { await db.close().catch(() => {}); process.exit(0); });
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  log.error('démarrage impossible', { err: err.message });
  process.exit(1);
});
