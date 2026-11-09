'use strict';
// Moteur de réservation transactionnel.
// Règle d'or : on ne fait jamais « SELECT puis INSERT » pour réserver. On tente l'INSERT
// et la contrainte d'exclusion PostgreSQL refuse atomiquement tout chevauchement.

const db = require('../db');
const { getSettings } = require('../lib/settings');
const { MIN, dayStart, dateStr } = require('../lib/time');
const { bad, conflict, gone, notFound, PG } = require('../lib/errors');
const { validateContact, isIdemKey } = require('../lib/validate');
const { notify } = require('../lib/notify');
const log = require('../lib/log');
const av = require('./availability');

const ACTIVE = ['hold', 'pending_payment', 'quote', 'confirmed'];

const iso = (ms) => new Date(ms).toISOString();
const isExpired = (b) => ['hold', 'pending_payment'].includes(b.status) && b.expires_at && new Date(b.expires_at).getTime() <= Date.now();

function publicBooking(b) {
  return {
    id: b.id,
    ref: b.ref,
    status: isExpired(b) ? 'expired' : b.status,
    mode: b.mode,
    packageId: b.package_id,
    packageName: b.package_name,
    durationMin: b.duration_min,
    sessions: b.sessions,
    price: b.price,
    currency: b.currency,
    isQuote: b.is_quote,
    start: new Date(b.starts_at).toISOString(),
    end: new Date(b.ends_at).toISOString(),
    expiresAt: b.expires_at ? new Date(b.expires_at).toISOString() : null,
    contact: b.contact || null,
    serverTime: new Date().toISOString(),
  };
}

// Passe en « expired » les réservations temporaires dont le délai est dépassé.
// Appelée par le worker (toutes) et avant chaque tentative de réservation (zone concernée).
async function expireStale(c, scope) {
  const params = [];
  let where = `status IN ('hold','pending_payment') AND expires_at <= now()`;
  if (scope) {
    params.push(scope.resourceIds, iso(scope.from), iso(scope.to));
    where += ' AND resource_id = ANY($1) AND during && tstzrange($2::timestamptz, $3::timestamptz)';
  }
  const { rows } = await c.query(
    `WITH x AS (SELECT id, status FROM bookings WHERE ${where} ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED)
     UPDATE bookings b SET status = 'expired', updated_at = now()
       FROM x WHERE b.id = x.id
     RETURNING b.id, x.status AS old_status`,
    params
  );
  for (const r of rows) {
    if (r.old_status === 'pending_payment') await notify(c, r.id, 'expired');
  }
  return rows.length;
}

function checkStartRules(settings, startMs, durMin, { forAdmin = false } = {}) {
  if (!Number.isFinite(startMs)) throw bad('Horaire invalide.');
  const ds = dateStr(startMs);
  const { open, close } = av.dayWindow(settings, ds);
  const offset = startMs - dayStart(ds);
  if (offset % (settings.studio.stepMin * MIN) !== 0) throw bad('Horaire invalide.');
  if (startMs < open || startMs + durMin * MIN > close) throw bad('Cet horaire est en dehors des heures du studio.');
  const range = av.bookableRange(settings, Date.now());
  if (!forAdmin) {
    if (ds < range.first || ds > range.last) throw bad('Cette date n’est pas encore ouverte à la réservation.');
    if (startMs < range.earliestStart) throw bad('Cet horaire est trop proche ou déjà passé.');
  } else if (startMs < Date.now()) {
    throw bad('Cet horaire est déjà passé.');
  }
  return ds;
}

async function isBlockedDay(c, ds) {
  const { rowCount } = await c.query('SELECT 1 FROM blocked_days WHERE day = $1', [ds]);
  return rowCount > 0;
}

// Verrou court par ressource, toujours pris dans le même ordre (pas d'interblocage possible).
// Il évite que deux insertions simultanées sur la même ressource s'attendent mutuellement ;
// la contrainte d'exclusion reste la garantie finale contre les doubles réservations.
async function lockResources(c, ids) {
  for (const id of [...new Set(ids)].sort()) {
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('ocd-resource:' || $1))`, [id]);
  }
}

// Essaie d'écrire `write(resourceId)` sur chaque ressource jusqu'à ce que l'une passe la contrainte.
async function tryResources(c, resources, write) {
  await lockResources(c, resources.map((r) => r.id));
  for (const r of resources) {
    await c.query('SAVEPOINT try_resource');
    try {
      const row = await write(r.id);
      await c.query('RELEASE SAVEPOINT try_resource');
      return row;
    } catch (err) {
      await c.query('ROLLBACK TO SAVEPOINT try_resource');
      if (err.code === PG.EXCLUSION) continue;
      throw err;
    }
  }
  return null;
}

// ÉTAPE E — verrouiller atomiquement un créneau (réservation temporaire de quelques minutes).
async function createHold({ mode, packageId, start, idempotencyKey, source = 'web' }) {
  av.assertMode(mode);
  if (idempotencyKey != null && !isIdemKey(idempotencyKey)) throw bad('Clé d’idempotence invalide.');
  const startMs = Date.parse(start);

  const result = await db.withTx(async (c) => {
    if (idempotencyKey) {
      const { rows } = await c.query('SELECT * FROM bookings WHERE idempotency_key = $1', [idempotencyKey]);
      if (rows[0]) return { booking: rows[0], replay: true };
    }
    const pkg = await av.getActivePackage(c, packageId, mode);
    const settings = await getSettings(c);
    const ds = checkStartRules(settings, startMs, pkg.duration_min);
    if (await isBlockedDay(c, ds)) throw conflict('day_closed', 'Le studio est fermé ce jour-là.');

    const resources = await av.resourcesFor(c, mode);
    const endMs = startMs + pkg.duration_min * MIN;
    const blockEnd = endMs + settings.studio.bufferMin * MIN;
    await expireStale(c, { resourceIds: resources.map((r) => r.id), from: startMs, to: blockEnd });

    const price = av.priceFor(pkg, mode, startMs);
    let row;
    try {
      row = await tryResources(c, resources, async (resourceId) => {
        const { rows } = await c.query(
          `INSERT INTO bookings (status, mode, package_id, package_name, duration_min, sessions, price, is_quote,
                                 resource_id, starts_at, ends_at, during, idempotency_key, expires_at, source)
           VALUES ('hold', $1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz,
                   tstzrange($9::timestamptz, $11::timestamptz, '[)'), $12, now() + make_interval(mins => $13), $14)
           RETURNING *`,
          [mode, pkg.id, pkg.name, pkg.duration_min, pkg.sessions, price, pkg.is_quote,
            resourceId, iso(startMs), iso(endMs), iso(blockEnd), idempotencyKey || null, settings.booking.holdMin, source]
        );
        return rows[0];
      });
    } catch (err) {
      // Même clé d'idempotence envoyée deux fois en parallèle : on renvoie la réservation déjà créée.
      if (err.code === PG.UNIQUE && idempotencyKey) {
        const { rows } = await c.query('SELECT * FROM bookings WHERE idempotency_key = $1', [idempotencyKey]);
        if (rows[0]) return { booking: rows[0], replay: true };
      }
      throw err;
    }

    if (!row) return { taken: true, pkg };
    log.info('créneau retenu', { bookingId: row.id, resource: row.resource_id, start: iso(startMs) });
    return { booking: row, replay: false };
  }, { retries: 3 });

  if (result.taken) {
    // Calculé après la transaction pour ne pas garder la ressource verrouillée.
    const alternatives = await av.findAlternatives(null, { mode, pkg: result.pkg, fromMs: startMs });
    log.info('créneau refusé (conflit)', { mode, packageId, start: iso(startMs) });
    throw conflict('slot_taken', 'Désolé, ce créneau vient d’être réservé par un autre client.', { alternatives });
  }
  return result;
}

async function lockBooking(c, id) {
  const { rows } = await c.query('SELECT * FROM bookings WHERE id = $1 FOR UPDATE', [id]);
  if (!rows[0]) throw notFound('Réservation introuvable.');
  return rows[0];
}

async function getBooking(id) {
  const { rows } = await db.query('SELECT * FROM bookings WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Réservation introuvable.');
  return rows[0];
}

// Le client abandonne ou change de créneau : on libère immédiatement.
async function releaseHold(id) {
  await db.query(
    `UPDATE bookings SET status = 'expired', cancel_reason = 'libéré par le client', updated_at = now()
      WHERE id = $1 AND status = 'hold'`, [id]
  );
}

// ÉTAPE 5 — informations commerciales (validées côté serveur).
async function saveContact(id, input) {
  const v = validateContact(input);
  if (!v.ok) throw bad('Certaines informations sont à corriger.', { fields: v.errors });
  return db.withTx(async (c) => {
    const b = await lockBooking(c, id);
    if (!['hold', 'pending_payment'].includes(b.status) || isExpired(b)) {
      throw gone('expired', 'Votre créneau n’est plus retenu. Choisissez de nouveau un horaire.');
    }
    const { rows } = await c.query('UPDATE bookings SET contact = $2, updated_at = now() WHERE id = $1 RETURNING *', [id, v.value]);
    return rows[0];
  });
}

const phoneKey = (p) => String(p || '').replace(/\D/g, '');

// ÉTAPES G et H — confirmation explicite du client après le récapitulatif.
async function confirmBooking(id) {
  return db.withTx(async (c) => {
    const b = await lockBooking(c, id);
    if (['pending_payment', 'quote', 'confirmed'].includes(b.status) && !isExpired(b)) return b; // idempotent
    if (b.status !== 'hold' || isExpired(b)) {
      throw gone('expired', 'Votre créneau n’est plus retenu. Choisissez de nouveau un horaire.');
    }
    if (!b.contact) throw bad('Vos informations sont incomplètes.');
    const settings = await getSettings(c);
    const ct = b.contact;
    const cust = await c.query(
      `INSERT INTO customers (phone, name, email, company, sector, country, city)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, customers.email),
         company = EXCLUDED.company, sector = EXCLUDED.sector, country = EXCLUDED.country, city = EXCLUDED.city, updated_at = now()
       RETURNING id`,
      [phoneKey(ct.phone), ct.name, ct.email || '', ct.company, ct.sector, ct.country, ct.city]
    );
    const status = b.is_quote ? 'quote' : b.price === 0 ? 'confirmed' : 'pending_payment';
    const { rows } = await c.query(
      `UPDATE bookings SET status = $2, customer_id = $3,
              ref = COALESCE(ref, 'OCD-' || lpad(nextval('booking_ref_seq')::text, 4, '0')),
              expires_at = CASE WHEN $2 = 'pending_payment' THEN now() + make_interval(mins => $4) ELSE NULL END,
              confirmed_at = CASE WHEN $2 = 'confirmed' THEN now() ELSE NULL END,
              updated_at = now()
        WHERE id = $1 RETURNING *`,
      [id, status, cust.rows[0].id, settings.booking.paymentTimeoutMin]
    );
    await notify(c, id, status);
    log.info('réservation confirmée par le client', { bookingId: id, status, ref: rows[0].ref });
    return rows[0];
  });
}

// Confirmation d'une réservation payée (appelée dans la transaction du paiement).
async function confirmPaid(c, bookingId) {
  const b = await lockBooking(c, bookingId);
  if (b.status === 'confirmed') return { booking: b, already: true };
  if (b.status === 'pending_payment' || b.status === 'quote') {
    const { rows } = await c.query(
      `UPDATE bookings SET status = 'confirmed', confirmed_at = now(), expires_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`, [bookingId]
    );
    await notify(c, bookingId, 'confirmed');
    return { booking: rows[0] };
  }
  // Payé après expiration ou annulation : on tente de récupérer le créneau s'il est encore libre.
  await lockResources(c, [b.resource_id]);
  await c.query('SAVEPOINT late_pay');
  try {
    const { rows } = await c.query(
      `UPDATE bookings SET status = 'confirmed', confirmed_at = now(), expires_at = NULL, cancelled_at = NULL, updated_at = now() WHERE id = $1 RETURNING *`, [bookingId]
    );
    await c.query('RELEASE SAVEPOINT late_pay');
    await notify(c, bookingId, 'confirmed');
    return { booking: rows[0], recovered: true };
  } catch (err) {
    await c.query('ROLLBACK TO SAVEPOINT late_pay');
    if (err.code !== PG.EXCLUSION) throw err;
    await notify(c, bookingId, 'late_payment');
    return { booking: b, latePayment: true };
  }
}

module.exports = {
  ACTIVE, publicBooking, isExpired, expireStale, checkStartRules, isBlockedDay, lockResources, tryResources,
  createHold, getBooking, lockBooking, releaseHold, saveContact, confirmBooking, confirmPaid,
};
