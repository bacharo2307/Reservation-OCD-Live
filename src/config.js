'use strict';
// Configuration technique. Volontairement minimale : sur Railway, seules DATABASE_URL et
// ANTHROPIC_API_KEY (réceptionniste IA) sont nécessaires. Les réglages métier (numéro Mobile Money,
// WhatsApp, emails de l'équipe, horaires, prix) se modifient dans l'espace équipe.

const crypto = require('node:crypto');

const env = process.env;
const onRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_PROJECT_ID);
const isProd = env.NODE_ENV === 'production' || onRailway;

function int(name, def) {
  const v = parseInt(env[name], 10);
  return Number.isFinite(v) ? v : def;
}

// Paiement simulé : uniquement en développement et en test, jamais en production.
const wantsDemo = (env.PAYMENT_PROVIDER || '').toLowerCase() === 'demo';
const paymentProvider = wantsDemo && !isProd ? 'demo' : 'manual';

module.exports = {
  isProd,
  onRailway,
  port: int('PORT', 3000),
  databaseUrl: env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ocdlive',
  dbPoolMax: int('DB_POOL_MAX', 10),
  dbSsl: env.DATABASE_SSL === 'true',
  redisUrl: env.REDIS_URL || '',
  // Secret de signature : APP_SECRET s'il est fourni, sinon généré une fois et gardé en base (initSecret).
  appSecret: env.APP_SECRET || 'dev-' + crypto.createHash('sha256').update(__dirname).digest('hex'),
  appSecretFromEnv: Boolean(env.APP_SECRET),
  appVersion: env.RAILWAY_GIT_COMMIT_SHA ? env.RAILWAY_GIT_COMMIT_SHA.slice(0, 8) : require('../package.json').version + '-' + Date.now().toString(36),
  publicUrl: (env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/$/, ''),
  trustProxy: int('TRUST_PROXY', 1),
  // Un seul service suffit : le service web fait aussi le travail du worker (désactivable).
  runWorkerInWeb: env.RUN_WORKER_IN_WEB !== 'false',
  workerIntervalMs: int('WORKER_INTERVAL_MS', 15000),

  admin: {
    // Seulement pour créer le tout premier compte ; inutile ensuite.
    bootstrapEmail: env.ADMIN_EMAIL || '',
    bootstrapPassword: env.ADMIN_PASSWORD || '',
    bootstrapName: env.ADMIN_NAME || 'Super administrateur',
    sessionHours: int('ADMIN_SESSION_HOURS', 12),
  },

  payments: {
    provider: paymentProvider, // manual (production) | demo (développement et tests)
  },

  ai: {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.AI_MODEL || 'claude-opus-5-5',
    effort: ['low', 'medium', 'high'].includes(env.AI_EFFORT) ? env.AI_EFFORT : 'low',
    maxConcurrency: int('AI_MAX_CONCURRENCY', 8),
    maxTurns: int('AI_MAX_TURNS', 60),
  },

  mail: {
    from: env.MAIL_FROM || 'OCD LIVE <onboarding@resend.dev>',
    resendApiKey: env.RESEND_API_KEY || '',
    smtpHost: env.SMTP_HOST || '',
    smtpPort: int('SMTP_PORT', 587),
    smtpUser: env.SMTP_USER || '',
    smtpPass: env.SMTP_PASS || '',
    smtpSecure: env.SMTP_SECURE === 'true',
  },
};
