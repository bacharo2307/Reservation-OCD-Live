'use strict';
// Réglages stockés en base (modifiables dans l'espace équipe), avec un cache court.

const db = require('../db');

const DEFAULTS = {
  studio: { openHour: 8, closeHour: 20, stepMin: 30, bufferMin: 30 },
  booking: { holdMin: 5, paymentTimeoutMin: 60, launchDate: '2026-12-01', horizonDays: 120, leadMin: 60 },
  brand: { name: 'OCD LIVE', org: "OCD — Opportunité C'est Dehors", slogan: "Les opportunités, c'est dehors.", channel: 'House of Challenge', studio: 'Studio OCD de Lomé', logoUrl: '' },
  voice: { enabled: false },
};

let cached = null;
let cachedAt = 0;
const TTL = 10000;

async function getSettings(client) {
  if (!client && cached && Date.now() - cachedAt < TTL) return cached;
  const { rows } = await (client || db).query('SELECT key, value FROM settings');
  const out = JSON.parse(JSON.stringify(DEFAULTS));
  for (const r of rows) out[r.key] = { ...(out[r.key] || {}), ...r.value };
  if (!client) { cached = out; cachedAt = Date.now(); }
  return out;
}

async function setSetting(client, key, value) {
  await client.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );
  cached = null;
}

function clearCache() { cached = null; }

module.exports = { getSettings, setSetting, clearCache, DEFAULTS };
