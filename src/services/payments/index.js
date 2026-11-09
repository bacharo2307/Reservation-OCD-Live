'use strict';
// Paiements idempotents : une réservation ne peut générer qu'un seul encaissement,
// malgré un double clic, une répétition réseau ou un webhook reçu plusieurs fois.

const crypto = require('node:crypto');
const db = require('../../db');
const { bad, gone, notFound, PG } = require('../../lib/errors');
const { isIdemKey } = require('../../lib/validate');
const booking = require('../booking');
const providers = require('./providers');
const log = require('../../lib/log');

const METHODS = ['mobile_money_tg', 'mobile_money_other', 'card'];

function publicPayment(p, extra = {}) {
  return { id: p.id, provider: p.provider, providerRef: p.provider_ref, method: p.method, amount: p.amount, currency: p.currency, status: p.status, ...extra };
}

// ÉTAPE H — démarrer le paiement d'une réservation en attente.
async function startPayment(bookingId, { method, idempotencyKey }) {
  if (!METHODS.includes(method)) throw bad('Moyen de paiement invalide.');
  if (!isIdemKey(idempotencyKey)) throw bad('Clé d’idempotence manquante.');
  const provider = providers.current();

  return db.withTx(async (c) => {
    const same = await c.query('SELECT * FROM payments WHERE idempotency_key = $1', [idempotencyKey]);
    if (same.rows[0]) return { payment: same.rows[0], instructions: same.rows[0].raw?.instructions, replay: true };

    const b = await booking.lockBooking(c, bookingId);
    if (b.status === 'confirmed') return { alreadyPaid: true, booking: b };
    if (b.is_quote || b.price == null) throw bad('Cette formule est sur devis : pas de paiement en ligne.');
    if (b.status !== 'pending_payment' || booking.isExpired(b)) {
      throw gone('expired', 'Le délai de paiement est dépassé : le créneau a été libéré.');
    }

    const open = await c.query(`SELECT * FROM payments WHERE booking_id = $1 AND status IN ('pending','processing')`, [bookingId]);
    if (open.rows[0]) return { payment: open.rows[0], instructions: open.rows[0].raw?.instructions, replay: true };

    const init = await provider.create({ booking: b, method });
    const { rows } = await c.query(
      `INSERT INTO payments (booking_id, provider, provider_ref, method, amount, currency, status, idempotency_key, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [b.id, provider.name, init.providerRef, method, b.price, b.currency, init.status || 'pending', idempotencyKey,
        { instructions: init.instructions || null, redirectUrl: init.redirectUrl || null }]
    );
    log.info('paiement démarré', { bookingId, provider: provider.name, paymentId: rows[0].id });
    return { payment: rows[0], instructions: init.instructions, redirectUrl: init.redirectUrl };
  });
}

// Traite un événement de prestataire (webhook signé). Idempotent par event_id.
async function handleEvent(providerName, evt) {
  return db.withTx(async (c) => {
    const ins = await c.query(
      `INSERT INTO webhook_events (provider, event_id, payload) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING event_id`,
      [providerName, evt.eventId, evt]
    );
    if (!ins.rowCount) return { duplicate: true };

    const { rows } = await c.query('SELECT * FROM payments WHERE provider = $1 AND provider_ref = $2 FOR UPDATE', [providerName, evt.providerRef]);
    const p = rows[0];
    if (!p) { log.warn('webhook pour un paiement inconnu', { providerName, ref: evt.providerRef }); return { unknown: true }; }

    if (evt.type === 'succeeded') {
      if (p.status === 'succeeded') return { already: true };
      if (evt.amount != null && Number(evt.amount) !== p.amount) {
        await c.query(`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1`, [p.id]);
        log.warn('montant payé différent du montant attendu', { paymentId: p.id, got: evt.amount, want: p.amount });
        return { amountMismatch: true };
      }
      await c.query(`UPDATE payments SET status = 'succeeded', updated_at = now() WHERE id = $1`, [p.id]);
      const r = await booking.confirmPaid(c, p.booking_id);
      log.info('paiement réussi', { paymentId: p.id, bookingId: p.booking_id });
      return { succeeded: true, ...r };
    }
    await c.query(`UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1 AND status IN ('pending','processing')`, [p.id]);
    return { failed: true };
  });
}

async function handleWebhook(providerName, rawBody, headers) {
  const provider = providers.get(providerName);
  if (!provider) throw notFound('Prestataire inconnu.');
  if (!rawBody || !provider.verifyWebhook(rawBody, headers)) {
    const err = bad('Signature invalide.');
    err.status = 401;
    throw err;
  }
  return handleEvent(providerName, provider.parseWebhook(rawBody));
}

// Démo uniquement : simule l'appel du prestataire, par le même chemin signé qu'un vrai webhook.
async function completeDemo(bookingId, providerRef) {
  if (providers.current().name !== 'demo') throw notFound();
  const { rows } = await db.query(`SELECT * FROM payments WHERE provider = 'demo' AND provider_ref = $1 AND booking_id = $2`, [providerRef, bookingId]);
  if (!rows[0]) throw notFound('Paiement introuvable.');
  const body = Buffer.from(JSON.stringify({ id: 'evt_' + crypto.randomBytes(8).toString('hex'), type: 'payment.succeeded', providerRef, amount: rows[0].amount }));
  return handleWebhook('demo', body, { 'x-demo-signature': providers.registry.demo.sign(body) });
}

// Espace équipe : paiement Mobile Money reçu hors ligne.
async function markManualPaid(c, bookingId, actorEmail) {
  const b = await booking.lockBooking(c, bookingId);
  if (b.status === 'confirmed') return { already: true };
  const open = await c.query(`SELECT * FROM payments WHERE booking_id = $1 AND status IN ('pending','processing') FOR UPDATE`, [bookingId]);
  if (open.rows[0]) {
    await c.query(`UPDATE payments SET status = 'succeeded', raw = COALESCE(raw, '{}'::jsonb) || $2, updated_at = now() WHERE id = $1`,
      [open.rows[0].id, { confirmedBy: actorEmail }]);
  } else if (b.price != null) {
    try {
      await c.query('SAVEPOINT manual_pay');
      await c.query(
        `INSERT INTO payments (booking_id, provider, provider_ref, method, amount, currency, status, idempotency_key, raw)
         VALUES ($1, 'manual', $2, 'mobile_money_tg', $3, $4, 'succeeded', $5, $6)`,
        [b.id, `MAN-${b.ref}-${crypto.randomBytes(4).toString('hex')}`, b.price, b.currency, 'admin-' + b.id, { confirmedBy: actorEmail }]
      );
      await c.query('RELEASE SAVEPOINT manual_pay');
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT manual_pay');
      if (err.code !== PG.UNIQUE) throw err;
    }
  }
  return booking.confirmPaid(c, bookingId);
}

module.exports = { METHODS, publicPayment, startPayment, handleEvent, handleWebhook, completeDemo, markManualPaid };
