'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config');
const log = require('./lib/log');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai').router;

const PUBLIC = path.join(__dirname, '..', 'public');

// Les pages HTML référencent les fichiers avec ?v=<version> : cache CDN long et sans risque.
function htmlPage(file) {
  let cached = null;
  return (req, res) => {
    if (!cached || !config.isProd) cached = fs.readFileSync(path.join(PUBLIC, file), 'utf8').replaceAll('__V__', config.appVersion);
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(cached);
  };
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());

  // Journal des requêtes API (JSON) avec identifiant de requête.
  app.use('/api', (req, res, next) => {
    req.id = req.get('x-request-id') || crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.setHeader('Cache-Control', 'no-store'); // jamais de cache public sur l'API
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      if (req.path === '/health') return;
      log.info('http', { reqId: req.id, method: req.method, path: req.baseUrl + req.path, status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6 });
    });
    next();
  });

  app.use('/api', express.json({ limit: '32kb', verify: (req, res, buf) => { req.rawBody = buf; } }));
  app.use('/api/admin', adminRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue.' } }));

  // Pages
  app.get('/', htmlPage('index.html'));
  app.get(['/admin', '/admin/'], htmlPage('admin/index.html'));

  // Fichiers statiques
  app.use((req, res, next) => {
    if (req.path === '/sw.js') res.setHeader('Cache-Control', 'no-cache');
    else if (req.query.v) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else res.setHeader('Cache-Control', 'public, max-age=300');
    next();
  });
  app.use(express.static(PUBLIC, { index: false, cacheControl: false, extensions: false }));

  app.use((req, res) => res.status(404).type('text').send('Page introuvable.'));

  // Erreurs
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: { code: 'invalid', message: 'Requête invalide.' } });
    }
    const status = err.status || 500;
    if (status >= 500) log.error('erreur serveur', { reqId: req.id, err: err.message, stack: err.stack });
    res.status(status).json({
      error: {
        code: err.code && status < 500 ? err.code : status >= 500 ? 'server_error' : 'error',
        message: status >= 500 ? 'Une erreur est survenue. Réessayez dans un instant.' : err.message,
        ...(status < 500 ? err.extra : {}),
      },
    });
  });

  return app;
}

module.exports = { createApp };
