'use strict';
// Secret de signature des jetons : APP_SECRET s'il est défini, sinon généré au premier démarrage
// et gardé en base (table app_secrets, jamais exposée par l'API). Toutes les instances le partagent.

const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');

async function initSecret() {
  if (config.appSecretFromEnv) return config.appSecret;
  await db.query(`INSERT INTO app_secrets (key, value) VALUES ('app', $1) ON CONFLICT (key) DO NOTHING`, [crypto.randomBytes(48).toString('base64url')]);
  const { rows } = await db.query(`SELECT value FROM app_secrets WHERE key = 'app'`);
  config.appSecret = rows[0].value;
  return config.appSecret;
}

module.exports = { initSecret };
