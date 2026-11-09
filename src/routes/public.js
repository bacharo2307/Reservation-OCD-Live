'use strict';
// API publique (parcours client). Aucun compte requis : chaque réservation est protégée par son jeton.

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const db = require('../db');
const ai = require('../services/ai/receptionist');
const config = require('../config');
const { getSettings } = require('../lib/settings');
const { COUNTRIES, SECTORS, isUuid } = require('../lib/validate');
const { checkBookingToken, bookingToken } = require('../lib/tokens');
const { notFound, unauthorized } = require('../lib/errors');
const { rateLimit } = require('../lib/ratelimit');
const av = require('../services/availability');
const booking = require('../services/booking');
const payments = require('../services/payments');
const providers = require('../services/payments/providers');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function publicPackage(p) {
  return {
    id: p.id, name: p.name, tagline: p.tagline, description: p.description, perks: p.perks, conditions: p.conditions,
    modes: p.modes, durationMin: p.duration_min, sessions: p.sessions, isQuote: p.is_quote, badge: p.badge,
    prices: { presentiel: p.price_presentiel, distance: p.price_distance },
    promo: p.promo_percent ? { label: p.promo_label, percent: p.promo_percent, from: p.promo_from, to: p.promo_to } : null,
  };
}

// Vérifie le jeton client de la réservation (en-tête X-Booking-Token).
const withBooking = wrap(async (req, res, next) => {
  const id = req.params.id;
  if (!isUuid(id)) throw notFound('Réservation introuvable.');
  if (!checkBookingToken(id, req.get('x-booking-token'))) throw unauthorized('Lien de réservation invalide.');
  next();
});

router.get('/health', wrap(async (req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok', db: 'ok', version: config.appVersion, time: new Date().toISOString() });
}));

// Logo officiel : déposer public/brand/logo.svg (ou .png / .webp) suffit à l'afficher partout.
const BRAND_DIR = path.join(__dirname, '..', '..', 'public', 'brand');
function brandLogo() {
  for (const f of ['logo.svg', 'logo.png', 'logo.webp']) {
    if (fs.existsSync(path.join(BRAND_DIR, f))) return '/brand/' + f + '?v=' + config.appVersion;
  }
  return '';
}

router.get('/config', wrap(async (req, res) => {
  const s = await getSettings();
  const provider = providers.current();
  res.json({
    brand: { ...s.brand, logoUrl: s.brand.logoUrl || brandLogo() },
    studio: s.studio,
    booking: { holdMin: s.booking.holdMin, paymentTimeoutMin: s.booking.paymentTimeoutMin, launchDate: s.booking.launchDate, horizonDays: s.booking.horizonDays, leadMin: s.booking.leadMin },
    payment: { provider: provider.name, live: provider.live, methods: payments.METHODS },
    voice: { enabled: await ai.enabled(), whatsapp: String((s.contact || {}).whatsapp || '').replace(/[^\d+]/g, '') || null },
    countries: COUNTRIES.map(([name, tz]) => ({ name, tz })),
    sectors: SECTORS,
    serverTime: new Date().toISOString(),
  });
}));

router.get('/packages', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM packages WHERE active ORDER BY sort, name');
  const mode = req.query.mode;
  res.json({ packages: rows.filter((p) => !mode || p.modes.includes(mode)).map(publicPackage) });
}));

router.get('/availability/month', wrap(async (req, res) => {
  res.json(await av.monthAvailability({ mode: req.query.mode, packageId: req.query.package, month: req.query.month }));
}));

router.get('/availability/day', wrap(async (req, res) => {
  const ignoreId = isUuid(req.query.booking) && checkBookingToken(req.query.booking, req.get('x-booking-token')) ? req.query.booking : null;
  res.json(await av.dayAvailability({ mode: req.query.mode, packageId: req.query.package, date: req.query.date, ignoreId }));
}));

// Retenir un créneau. Le client peut libérer son ancien créneau dans la même demande.
router.post('/holds', rateLimit({ name: 'holds', windowSec: 600, max: 40 }), wrap(async (req, res) => {
  const { mode, packageId, start, previous } = req.body || {};
  if (previous && isUuid(previous.id) && checkBookingToken(previous.id, previous.token)) {
    await booking.releaseHold(previous.id);
  }
  const r = await booking.createHold({ mode, packageId, start, idempotencyKey: req.get('idempotency-key') || null });
  res.status(r.replay ? 200 : 201).json({ booking: booking.publicBooking(r.booking), token: bookingToken(r.booking.id) });
}));

router.get('/bookings/:id', withBooking, wrap(async (req, res) => {
  res.json({ booking: booking.publicBooking(await booking.getBooking(req.params.id)) });
}));

router.delete('/bookings/:id', withBooking, wrap(async (req, res) => {
  await booking.releaseHold(req.params.id);
  res.json({ ok: true });
}));

router.put('/bookings/:id/contact', withBooking, rateLimit({ name: 'contact', windowSec: 600, max: 60 }), wrap(async (req, res) => {
  res.json({ booking: booking.publicBooking(await booking.saveContact(req.params.id, req.body)) });
}));

router.post('/bookings/:id/confirm', withBooking, wrap(async (req, res) => {
  res.json({ booking: booking.publicBooking(await booking.confirmBooking(req.params.id)) });
}));

router.post('/bookings/:id/payments', withBooking, rateLimit({ name: 'pay', windowSec: 600, max: 30 }), wrap(async (req, res) => {
  const r = await payments.startPayment(req.params.id, { method: req.body && req.body.method, idempotencyKey: req.get('idempotency-key') });
  const b = await booking.getBooking(req.params.id);
  res.json({
    booking: booking.publicBooking(b),
    alreadyPaid: Boolean(r.alreadyPaid),
    payment: r.payment ? payments.publicPayment(r.payment) : null,
    instructions: r.instructions || null,
    redirectUrl: r.redirectUrl || null,
  });
}));

// Démo uniquement (PAYMENT_PROVIDER=demo).
router.post('/bookings/:id/payments/demo-complete', withBooking, wrap(async (req, res) => {
  const ref = String((req.body && req.body.providerRef) || '');
  await payments.completeDemo(req.params.id, ref);
  res.json({ booking: booking.publicBooking(await booking.getBooking(req.params.id)) });
}));

// Webhooks des prestataires de paiement (corps brut conservé pour vérifier la signature).
router.post('/webhooks/payments/:provider', wrap(async (req, res) => {
  const r = await payments.handleWebhook(req.params.provider, req.rawBody, req.headers);
  res.json({ ok: true, duplicate: Boolean(r.duplicate) });
}));

module.exports = router;
