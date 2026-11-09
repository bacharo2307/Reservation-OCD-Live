'use strict';
// API de la réceptionniste IA. Chaque conversation est protégée par son propre jeton.

const crypto = require('node:crypto');
const express = require('express');
const config = require('../config');
const { isUuid } = require('../lib/validate');
const { notFound, unauthorized } = require('../lib/errors');
const { rateLimit } = require('../lib/ratelimit');
const ai = require('../services/ai/receptionist');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const sessionToken = (id) => crypto.createHmac('sha256', config.appSecret).update('ai:' + id).digest('base64url');
function checkToken(id, token) {
  if (typeof token !== 'string') return false;
  const a = Buffer.from(sessionToken(id));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const withSession = (req, res, next) => {
  if (!isUuid(req.params.id)) return next(notFound('Conversation introuvable.'));
  if (!checkToken(req.params.id, req.get('x-ai-token'))) return next(unauthorized('Conversation invalide.'));
  next();
};

router.post('/sessions', rateLimit({ name: 'ai-start', windowSec: 600, max: 12 }), wrap(async (req, res) => {
  const channel = (req.body || {}).channel === 'voice' ? 'voice' : 'text';
  const s = await ai.createSession({ channel, ip: req.ip });
  res.status(201).json({ session: { id: s.id, token: sessionToken(s.id) }, reply: s.reply, state: s.state });
}));

router.post('/sessions/:id/messages', withSession, rateLimit({ name: 'ai-msg', windowSec: 600, max: 90 }), wrap(async (req, res) => {
  res.json(await ai.sendMessage(req.params.id, (req.body || {}).text));
}));

router.post('/sessions/:id/end', withSession, wrap(async (req, res) => {
  res.json(await ai.endSession(req.params.id, { keepHold: Boolean((req.body || {}).keepHold) }));
}));

module.exports = { router, sessionToken };
