'use strict';
// Toutes les variables d'environnement sont lues ici (voir .env.example).

const crypto = require('node:crypto');

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function int(name, def) {
  const v = parseInt(env[name], 10);
  return Number.isFinite(v) ? v : def;
}

let appSecret = env.APP_SECRET;
if (!appSecret) {
  if (isProd) {
    throw new Error('APP_SECRET est obligatoire en production (chaîne aléatoire de 32 caractères ou plus).');
  }
  appSecret = 'dev-secret-' + crypto.createHash('sha256').update(__dirname).digest('hex');
}

const paymentProvider = (env.PAYMENT_PROVIDER || 'manual').toLowerCase();
if (paymentProvider === 'demo' && isProd && env.ALLOW_DEMO_PAYMENTS !== 'true') {
  throw new Error('PAYMENT_PROVIDER=demo est refusé en production sans ALLOW_DEMO_PAYMENTS=true.');
}

module.exports = {
  isProd,
  port: int('PORT', 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ocdlive',
  dbPoolMax: int('DB_POOL_MAX', 10),
  dbSsl: env.DATABASE_SSL === 'true',
  redisUrl: env.REDIS_URL || '',
  appSecret,
  appVersion: env.RAILWAY_GIT_COMMIT_SHA ? env.RAILWAY_GIT_COMMIT_SHA.slice(0, 8) : require('../package.json').version + '-' + Date.now().toString(36),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  trustProxy: int('TRUST_PROXY', 1),
  runWorkerInWeb: env.RUN_WORKER_IN_WEB === 'true',
  workerIntervalMs: int('WORKER_INTERVAL_MS', 15000),

  admin: {
    bootstrapEmail: env.ADMIN_EMAIL || '',
    bootstrapPassword: env.ADMIN_PASSWORD || '',
    bootstrapName: env.ADMIN_NAME || 'Super administrateur',
    sessionHours: int('ADMIN_SESSION_HOURS', 12),
  },

  payments: {
    provider: paymentProvider, // manual | demo
    manualNumber: env.PAYMENT_MANUAL_NUMBER || '',
    manualName: env.PAYMENT_MANUAL_NAME || 'OCD',
    demoWebhookSecret: env.DEMO_WEBHOOK_SECRET || appSecret,
  },

  mail: {
    from: env.MAIL_FROM || 'OCD LIVE <no-reply@ocdlive.local>',
    teamEmails: (env.TEAM_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean),
    resendApiKey: env.RESEND_API_KEY || '',
    smtpHost: env.SMTP_HOST || '',
    smtpPort: int('SMTP_PORT', 587),
    smtpUser: env.SMTP_USER || '',
    smtpPass: env.SMTP_PASS || '',
    smtpSecure: env.SMTP_SECURE === 'true',
  },
};
