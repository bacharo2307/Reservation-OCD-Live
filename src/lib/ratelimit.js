'use strict';
// Limitation des requêtes répétitives. Redis si REDIS_URL est défini (partagé entre instances),
// sinon mémoire locale. Si Redis tombe, on bascule en mémoire au lieu de bloquer le service.

const config = require('../config');
const log = require('./log');
const { AppError } = require('./errors');

let redis = null;
if (config.redisUrl) {
  try {
    const Redis = require('ioredis');
    redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    redis.on('error', (err) => log.warn('redis indisponible, limitation en mémoire', { err: err.message }));
  } catch (err) {
    log.warn('ioredis non chargé', { err: err.message });
  }
}

const memory = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memory) if (v.reset <= now) memory.delete(k);
}, 60000).unref();

async function hit(key, windowSec) {
  if (redis && redis.status === 'ready') {
    try {
      const n = await redis.incr(key);
      if (n === 1) await redis.expire(key, windowSec);
      return n;
    } catch (_) { /* repli mémoire */ }
  }
  const now = Date.now();
  const cur = memory.get(key);
  if (!cur || cur.reset <= now) { memory.set(key, { n: 1, reset: now + windowSec * 1000 }); return 1; }
  cur.n += 1;
  return cur.n;
}

function rateLimit({ name, windowSec, max, key }) {
  return async (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    try {
      const k = `rl:${name}:${key ? key(req) : req.ip}`;
      const n = await hit(k, windowSec);
      if (n > max) {
        res.setHeader('Retry-After', String(windowSec));
        return next(new AppError(429, 'rate_limited', 'Trop de tentatives. Patientez quelques instants.'));
      }
      next();
    } catch (err) { next(err); }
  };
}

module.exports = { rateLimit, redisClient: () => redis };
