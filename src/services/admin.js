'use strict';
// Actions de l'équipe sur les réservations. Chaque action est transactionnelle, historisée,
// et reste soumise à la contrainte d'exclusion (pas de chevauchement possible, même pour l'équipe).

const db = require('../db');
const { getSettings } = require('../lib/settings');
const { MIN, dateStr } = require('../lib/time');
const { bad, conflict, PG } = require('../lib/errors');
const { notify } = require('../lib/notify');
const { audit } = require('../lib/audit');
const av = require('./availability');
const booking = require('./booking');
const payments = require('./payments');

const iso = (ms) => new Date(ms).toISOString();

async function confirm(req, id) {
  return db.withTx(async (c) => {
    const b = await booking.lockBooking(c, id);
    if (b.status === 'confirmed') return b;
    if (b.status === 'quote') {
      const { rows } = await c.query(
        `UPDATE bookings SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [id]
      );
      await notify(c, id, 'quote_accepted');
      await audit(c, req, 'booking.confirm_quote', 'booking', id, { ref: b.ref });
      return rows[0];
    }
    if (b.status === 'pending_payment' || b.status === 'expired') {
      const r = await payments.markManualPaid(c, id, req.admin.email);
      if (r.latePayment) throw conflict('slot_taken', 'Le créneau a été repris entre-temps : reportez la réservation sur un autre horaire.');
      await audit(c, req, 'booking.confirm_payment', 'booking', id, { ref: b.ref, amount: b.price });
      return r.booking;
    }
    throw bad('Cette réservation ne peut pas être confirmée.');
  });
}

async function cancel(req, id, reason) {
  const why = String(reason || '').trim().slice(0, 200);
  return db.withTx(async (c) => {
    const b = await booking.lockBooking(c, id);
    if (!booking.ACTIVE.includes(b.status)) throw bad('Cette réservation n’est plus active.');
    const { rows } = await c.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2, expires_at = NULL, updated_at = now()
        WHERE id = $1 RETURNING *`, [id, why || null]
    );
    await c.query(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE booking_id = $1 AND status IN ('pending','processing')`, [id]);
    if (b.ref) await notify(c, id, 'cancelled', { reason: why });
    await audit(c, req, 'booking.cancel', 'booking', id, { ref: b.ref, reason: why });
    return rows[0];
  });
}

async function reschedule(req, id, start) {
  const startMs = Date.parse(start);
  return db.withTx(async (c) => {
    const b = await booking.lockBooking(c, id);
    if (!['pending_payment', 'quote', 'confirmed'].includes(b.status)) throw bad('Seule une réservation enregistrée peut être reportée.');
    const settings = await getSettings(c);
    const ds = booking.checkStartRules(settings, startMs, b.duration_min, { forAdmin: true });
    if (await booking.isBlockedDay(c, ds)) throw conflict('day_closed', 'Ce jour est bloqué.');
    const endMs = startMs + b.duration_min * MIN;
    const blockEnd = endMs + settings.studio.bufferMin * MIN;
    const resources = await av.resourcesFor(c, b.mode);
    // On garde la même ressource si possible.
    resources.sort((x, y) => (x.id === b.resource_id ? -1 : y.id === b.resource_id ? 1 : 0));
    await booking.expireStale(c, { resourceIds: resources.map((r) => r.id), from: startMs, to: blockEnd });
    const row = await booking.tryResources(c, resources, async (resourceId) => {
      const { rows } = await c.query(
        `UPDATE bookings SET resource_id = $2, starts_at = $3::timestamptz, ends_at = $4::timestamptz,
                during = tstzrange($3::timestamptz, $5::timestamptz, '[)'), updated_at = now()
          WHERE id = $1 RETURNING *`,
        [id, resourceId, iso(startMs), iso(endMs), iso(blockEnd)]
      );
      return rows[0];
    });
    if (!row) throw conflict('slot_taken', 'Cet horaire n’est pas libre.');
    await notify(c, id, 'rescheduled');
    await audit(c, req, 'booking.reschedule', 'booking', id, { ref: b.ref, from: b.starts_at, to: iso(startMs), day: dateStr(startMs) });
    return row;
  }, { retries: 3 });
}

async function assign(req, id, resourceId) {
  return db.withTx(async (c) => {
    const b = await booking.lockBooking(c, id);
    if (!booking.ACTIVE.includes(b.status)) throw bad('Cette réservation n’est plus active.');
    const { rows: res } = await c.query('SELECT * FROM resources WHERE id = $1 AND active', [resourceId]);
    const r = res[0];
    const kind = b.mode === 'presentiel' ? 'studio' : 'assistant';
    if (!r || r.kind !== kind) throw bad('Ressource invalide pour ce live.');
    await booking.lockResources(c, [resourceId]);
    await c.query('SAVEPOINT assign');
    try {
      const { rows } = await c.query('UPDATE bookings SET resource_id = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, resourceId]);
      await c.query('RELEASE SAVEPOINT assign');
      await audit(c, req, 'booking.assign', 'booking', id, { ref: b.ref, from: b.resource_id, to: resourceId });
      return rows[0];
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT assign');
      if (err.code === PG.EXCLUSION) throw conflict('resource_busy', `${r.name} a déjà un live à ce moment.`);
      throw err;
    }
  });
}

module.exports = { confirm, cancel, reschedule, assign };
