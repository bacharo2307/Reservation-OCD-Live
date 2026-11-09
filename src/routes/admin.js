'use strict';
// API de l'espace équipe. Chaque route vérifie la session et la permission du rôle.

const express = require('express');
const db = require('../db');
const auth = require('../lib/auth');
const { audit } = require('../lib/audit');
const { getSettings, setSetting } = require('../lib/settings');
const { bad, notFound, forbidden } = require('../lib/errors');
const { isUuid, clean } = require('../lib/validate');
const { isDateStr } = require('../lib/time');
const { rateLimit } = require('../lib/ratelimit');
const adminSvc = require('../services/admin');
const av = require('../services/availability');
const booking = require('../services/booking');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = auth.requireAdmin;

const page = (req) => {
  const p = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(100, Math.max(5, parseInt(req.query.size, 10) || 30));
  return { limit: size, offset: (p - 1) * size, page: p, size };
};

// ---------- Session ----------
router.post('/login', rateLimit({ name: 'login', windowSec: 900, max: 10, key: (req) => req.ip + ':' + String((req.body || {}).email || '').toLowerCase() }),
  wrap(async (req, res) => {
    const { email, password } = req.body || {};
    const r = await auth.login(email, password, req.ip, req.get('user-agent'));
    auth.setSessionCookie(res, r.token);
    await audit(db, { admin: { id: r.user.id, email: r.user.email }, ip: req.ip }, 'auth.login', 'admin_user', r.user.id);
    res.json({ user: r.user });
  }));

router.post('/logout', wrap(async (req, res) => {
  await auth.logout(auth.readCookie(req, auth.COOKIE));
  auth.clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', need(), wrap(async (req, res) => {
  res.json({ user: auth.publicUser(req.admin) });
}));

// ---------- Tableau de bord & notifications ----------
router.get('/dashboard', need('dashboard'), wrap(async (req, res) => {
  const { rows: [k] } = await db.query(`
    SELECT
      count(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
      count(*) FILTER (WHERE status IN ('pending_payment','quote') AND NOT (status = 'pending_payment' AND expires_at <= now()))::int AS waiting,
      count(*) FILTER (WHERE status = 'confirmed' AND starts_at BETWEEN now() AND now() + interval '7 days')::int AS next7,
      count(*) FILTER (WHERE status = 'confirmed' AND mode = 'distance')::int AS remote,
      count(*) FILTER (WHERE status = 'hold' AND expires_at > now())::int AS holds
    FROM bookings`);
  const { rows: [p] } = await db.query(`SELECT COALESCE(sum(amount), 0)::int AS revenue FROM payments WHERE status = 'succeeded'`);
  const { rows: [n] } = await db.query('SELECT count(*)::int AS unread FROM notifications WHERE read_at IS NULL');
  res.json({ kpis: { ...k, revenue: p.revenue, unread: n.unread } });
}));

router.get('/notifications', need('notifications'), wrap(async (req, res) => {
  const { limit, offset } = page(req);
  const { rows } = await db.query(
    `SELECT n.*, b.ref FROM notifications n LEFT JOIN bookings b ON b.id = n.booking_id
      ORDER BY n.created_at DESC, n.id DESC LIMIT $1 OFFSET $2`, [limit, offset]
  );
  res.json({ notifications: rows });
}));

router.post('/notifications/read', need('notifications'), wrap(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : null;
  if (ids && ids.length) await db.query('UPDATE notifications SET read_at = now() WHERE id = ANY($1) AND read_at IS NULL', [ids]);
  else await db.query('UPDATE notifications SET read_at = now() WHERE read_at IS NULL');
  res.json({ ok: true });
}));

// ---------- Réservations ----------
const STATUS_GROUPS = {
  active: ['pending_payment', 'quote', 'confirmed'],
  confirmed: ['confirmed'],
  waiting: ['pending_payment', 'quote'],
  closed: ['cancelled', 'expired'],
  all: ['pending_payment', 'quote', 'confirmed', 'cancelled', 'expired'],
};

router.get('/bookings', need('bookings.read'), wrap(async (req, res) => {
  const { limit, offset, page: p } = page(req);
  const statuses = STATUS_GROUPS[req.query.status] || STATUS_GROUPS.active;
  const params = [statuses];
  let where = `b.status = ANY($1) AND b.ref IS NOT NULL`;
  if (isDateStr(req.query.from)) { params.push(req.query.from); where += ` AND b.starts_at >= $${params.length}::date`; }
  if (isDateStr(req.query.to)) { params.push(req.query.to); where += ` AND b.starts_at < ($${params.length}::date + 1)`; }
  if (req.query.mode === 'presentiel' || req.query.mode === 'distance') { params.push(req.query.mode); where += ` AND b.mode = $${params.length}`; }
  if (req.query.q) {
    params.push('%' + clean(req.query.q, 60) + '%');
    const i = params.length;
    where += ` AND (b.ref ILIKE $${i} OR b.contact->>'name' ILIKE $${i} OR b.contact->>'company' ILIKE $${i} OR b.contact->>'phone' ILIKE $${i})`;
  }
  if (req.admin.role === 'assistant' && req.admin.resource_id) { params.push(req.admin.resource_id); where += ` AND b.resource_id = $${params.length}`; }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT b.*, r.name AS resource_name,
            (SELECT status FROM payments p WHERE p.booking_id = b.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status
       FROM bookings b JOIN resources r ON r.id = b.resource_id
      WHERE ${where} ORDER BY b.starts_at ASC LIMIT $${params.length - 1} OFFSET $${params.length}`, params
  );
  res.json({ page: p, bookings: rows.map((b) => ({ ...booking.publicBooking(b), resourceId: b.resource_id, resourceName: b.resource_name, paymentStatus: b.payment_status, source: b.source, cancelReason: b.cancel_reason, createdAt: b.created_at })) });
}));

const bookingId = (req) => {
  if (!isUuid(req.params.id)) throw notFound('Réservation introuvable.');
  return req.params.id;
};

router.post('/bookings/:id/confirm', need('bookings.read'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT status FROM bookings WHERE id = $1', [bookingId(req)]);
  if (!rows[0]) throw notFound();
  const perm = rows[0].status === 'quote' ? 'bookings.write' : 'payments.write';
  if (!auth.can(req.admin.role, perm)) throw forbidden();
  res.json({ booking: booking.publicBooking(await adminSvc.confirm(req, req.params.id)) });
}));

router.post('/bookings/:id/cancel', need('bookings.write'), wrap(async (req, res) => {
  res.json({ booking: booking.publicBooking(await adminSvc.cancel(req, bookingId(req), req.body && req.body.reason)) });
}));

router.post('/bookings/:id/reschedule', need('bookings.write'), wrap(async (req, res) => {
  res.json({ booking: booking.publicBooking(await adminSvc.reschedule(req, bookingId(req), req.body && req.body.start)) });
}));

router.post('/bookings/:id/assign', need('bookings.write'), wrap(async (req, res) => {
  res.json({ booking: booking.publicBooking(await adminSvc.assign(req, bookingId(req), req.body && req.body.resourceId)) });
}));

router.get('/availability/day', need('bookings.read'), wrap(async (req, res) => {
  const ignoreId = isUuid(req.query.booking) ? req.query.booking : null;
  res.json(await av.dayAvailability({ mode: req.query.mode, packageId: req.query.package, date: req.query.date, ignoreId }));
}));

// ---------- Packages ----------
router.get('/packages', need('dashboard'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM packages ORDER BY sort, name');
  res.json({ packages: rows });
}));

function packageFields(body, partial) {
  const b = body || {};
  const out = {};
  const str = (k, max) => { if (b[k] !== undefined) out[k] = clean(String(b[k] ?? ''), max); };
  const num = (k, min, max, nullable) => {
    if (b[k] === undefined) return;
    if (b[k] === null || b[k] === '') { if (!nullable) throw bad(`${k} obligatoire.`); out[k] = null; return; }
    const v = Number(b[k]);
    if (!Number.isInteger(v) || v < min || v > max) throw bad(`Valeur invalide pour ${k}.`);
    out[k] = v;
  };
  str('name', 60); str('tagline', 120); str('description', 600); str('conditions', 600); str('badge', 40); str('promo_label', 60);
  num('duration_min', 30, 720); num('sessions', 1, 31); num('price_presentiel', 0, 10000000, true); num('price_distance', 0, 10000000, true);
  num('promo_percent', 1, 90, true); num('sort', 0, 1000);
  if (b.perks !== undefined) {
    if (!Array.isArray(b.perks)) throw bad('Avantages invalides.');
    out.perks = JSON.stringify(b.perks.map((x) => clean(String(x), 120)).filter(Boolean).slice(0, 8));
  }
  if (b.modes !== undefined) {
    if (!Array.isArray(b.modes) || !b.modes.length || b.modes.some((m) => !av.MODES.includes(m))) throw bad('Modes invalides.');
    out.modes = [...new Set(b.modes)];
  }
  for (const k of ['promo_from', 'promo_to']) {
    if (b[k] !== undefined) { if (b[k] && !isDateStr(b[k])) throw bad('Date de promotion invalide.'); out[k] = b[k] || null; }
  }
  for (const k of ['is_quote', 'active']) if (b[k] !== undefined) out[k] = Boolean(b[k]);
  if (!partial && (!out.name || !out.modes || !out.duration_min)) throw bad('Nom, modes et durée sont obligatoires.');
  return out;
}

router.post('/packages', need('packages.write'), wrap(async (req, res) => {
  const f = packageFields(req.body, false);
  const id = clean(String((req.body || {}).id || f.name), 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!id) throw bad('Identifiant invalide.');
  const cols = ['id', ...Object.keys(f)];
  const vals = [id, ...Object.values(f)];
  const r = await db.withTx(async (c) => {
    const { rows } = await c.query(`INSERT INTO packages (${cols.join(', ')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(', ')}) RETURNING *`, vals);
    await audit(c, req, 'package.create', 'package', id, f);
    return rows[0];
  });
  res.status(201).json({ package: r });
}));

router.patch('/packages/:id', need('packages.write'), wrap(async (req, res) => {
  const f = packageFields(req.body, true);
  const keys = Object.keys(f);
  if (!keys.length) throw bad('Rien à modifier.');
  const r = await db.withTx(async (c) => {
    const { rows: before } = await c.query('SELECT * FROM packages WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!before[0]) throw notFound('Package introuvable.');
    const { rows } = await c.query(
      `UPDATE packages SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
      [req.params.id, ...Object.values(f)]
    );
    const changes = {};
    for (const k of keys) changes[k] = { avant: before[0][k], après: rows[0][k] };
    await audit(c, req, 'package.update', 'package', req.params.id, changes);
    return rows[0];
  });
  res.json({ package: r });
}));

// ---------- Ressources (studio, assistantes) ----------
router.get('/resources', need('dashboard'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM resources ORDER BY kind DESC, sort, id');
  res.json({ resources: rows });
}));

router.post('/resources', need('resources.write'), wrap(async (req, res) => {
  const kind = (req.body || {}).kind === 'studio' ? 'studio' : 'assistant';
  const name = clean(String((req.body || {}).name || ''), 60);
  if (name.length < 2) throw bad('Nom obligatoire.');
  const r = await db.withTx(async (c) => {
    const { rows: [m] } = await c.query(`SELECT count(*)::int AS n, COALESCE(max(sort), 0) AS s FROM resources WHERE kind = $1`, [kind]);
    const id = `${kind}-${Date.now().toString(36)}`;
    const { rows } = await c.query('INSERT INTO resources (id, kind, name, sort) VALUES ($1, $2, $3, $4) RETURNING *', [id, kind, name, m.s + 1]);
    await audit(c, req, 'resource.create', 'resource', id, { kind, name });
    return rows[0];
  });
  res.status(201).json({ resource: r });
}));

router.patch('/resources/:id', need('resources.write'), wrap(async (req, res) => {
  const b = req.body || {};
  const r = await db.withTx(async (c) => {
    const { rows: before } = await c.query('SELECT * FROM resources WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!before[0]) throw notFound('Ressource introuvable.');
    const name = b.name !== undefined ? clean(String(b.name), 60) : before[0].name;
    const active = b.active !== undefined ? Boolean(b.active) : before[0].active;
    if (name.length < 2) throw bad('Nom obligatoire.');
    const { rows } = await c.query('UPDATE resources SET name = $2, active = $3 WHERE id = $1 RETURNING *', [req.params.id, name, active]);
    await audit(c, req, 'resource.update', 'resource', req.params.id, { name, active });
    return rows[0];
  });
  res.json({ resource: r });
}));

// ---------- Jours bloqués ----------
router.get('/blocked-days', need('dashboard'), wrap(async (req, res) => {
  const { rows } = await db.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, reason FROM blocked_days WHERE day >= current_date - 1 ORDER BY day`);
  res.json({ days: rows });
}));

router.post('/blocked-days', need('days.write'), wrap(async (req, res) => {
  const day = (req.body || {}).day;
  if (!isDateStr(day)) throw bad('Date invalide.');
  const reason = clean(String((req.body || {}).reason || ''), 120);
  const r = await db.withTx(async (c) => {
    await c.query(`INSERT INTO blocked_days (day, reason, created_by) VALUES ($1, $2, $3) ON CONFLICT (day) DO UPDATE SET reason = EXCLUDED.reason`, [day, reason, req.admin.id]);
    const { rows: [n] } = await c.query(
      `SELECT count(*)::int AS n FROM bookings WHERE status IN ('pending_payment','quote','confirmed') AND starts_at >= $1::date AND starts_at < $1::date + 1`, [day]
    );
    await audit(c, req, 'day.block', 'blocked_day', day, { reason });
    return n.n;
  });
  res.status(201).json({ ok: true, existingBookings: r });
}));

router.delete('/blocked-days/:day', need('days.write'), wrap(async (req, res) => {
  if (!isDateStr(req.params.day)) throw bad('Date invalide.');
  await db.withTx(async (c) => {
    await c.query('DELETE FROM blocked_days WHERE day = $1', [req.params.day]);
    await audit(c, req, 'day.unblock', 'blocked_day', req.params.day);
  });
  res.json({ ok: true });
}));

// ---------- Clients, paiements, journal ----------
router.get('/customers', need('customers.read'), wrap(async (req, res) => {
  const { limit, offset } = page(req);
  const params = [limit, offset];
  let where = 'TRUE';
  if (req.query.q) { params.push('%' + clean(req.query.q, 60) + '%'); where = `(c.name ILIKE $3 OR c.company ILIKE $3 OR c.phone ILIKE $3)`; }
  const { rows } = await db.query(
    `SELECT c.*, count(b.id) FILTER (WHERE b.status = 'confirmed')::int AS lives, max(b.starts_at) AS last_live
       FROM customers c LEFT JOIN bookings b ON b.customer_id = c.id
      WHERE ${where} GROUP BY c.id ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`, params
  );
  res.json({ customers: rows });
}));

router.get('/payments', need('payments.read'), wrap(async (req, res) => {
  const { limit, offset } = page(req);
  const { rows } = await db.query(
    `SELECT p.id, p.provider, p.provider_ref, p.method, p.amount, p.currency, p.status, p.created_at, p.updated_at,
            b.ref, b.package_name, b.contact->>'name' AS customer, b.contact->>'company' AS company
       FROM payments p JOIN bookings b ON b.id = p.booking_id ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
  );
  res.json({ payments: rows });
}));

router.get('/audit', need('audit.read'), wrap(async (req, res) => {
  const { limit, offset } = page(req);
  const { rows } = await db.query('SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2', [limit, offset]);
  res.json({ entries: rows });
}));

// ---------- Utilisateurs (super administrateur) ----------
router.get('/users', need('users.manage'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT id, email, name, role, resource_id, active, last_login_at, created_at FROM admin_users ORDER BY created_at');
  res.json({ users: rows, roles: auth.ROLES });
}));

router.post('/users', need('users.manage'), wrap(async (req, res) => {
  const u = await db.withTx(async (c) => {
    const created = await auth.createUser(c, req.body || {});
    await audit(c, req, 'user.create', 'admin_user', created.id, { email: created.email, role: created.role });
    return created;
  });
  res.status(201).json({ user: auth.publicUser(u) });
}));

router.patch('/users/:id', need('users.manage'), wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const b = req.body || {};
  const u = await db.withTx(async (c) => {
    const { rows: before } = await c.query('SELECT * FROM admin_users WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!before[0]) throw notFound('Utilisateur introuvable.');
    const role = b.role !== undefined ? b.role : before[0].role;
    if (!auth.ROLES[role]) throw bad('Rôle invalide.');
    const active = b.active !== undefined ? Boolean(b.active) : before[0].active;
    if (req.params.id === req.admin.id && (!active || role !== 'super_admin')) throw bad('Vous ne pouvez pas retirer vos propres droits.');
    let hash = before[0].password_hash;
    if (b.password) { auth.checkPasswordStrength(b.password); hash = auth.hashPassword(b.password); }
    const resourceId = b.resourceId !== undefined ? (b.resourceId || null) : before[0].resource_id;
    const { rows } = await c.query(
      'UPDATE admin_users SET role = $2, active = $3, password_hash = $4, resource_id = $5 WHERE id = $1 RETURNING *',
      [req.params.id, role, active, hash, resourceId]
    );
    if (!active || b.password) await c.query('DELETE FROM admin_sessions WHERE user_id = $1', [req.params.id]);
    await audit(c, req, 'user.update', 'admin_user', req.params.id, { role, active, passwordChanged: Boolean(b.password), resourceId });
    return rows[0];
  });
  res.json({ user: auth.publicUser(u) });
}));

// ---------- Réglages ----------
router.get('/settings', need('dashboard'), wrap(async (req, res) => {
  res.json({ settings: await getSettings() });
}));

const SETTING_RULES = {
  studio: { openHour: [0, 23], closeHour: [1, 24], stepMin: [15, 120], bufferMin: [0, 180] },
  booking: { holdMin: [2, 30], paymentTimeoutMin: [5, 2880], horizonDays: [7, 365], leadMin: [0, 2880] },
  voice: { enabled: 'bool' },
};

router.put('/settings/:key', need('settings.write'), wrap(async (req, res) => {
  const rules = SETTING_RULES[req.params.key];
  if (!rules) throw bad('Réglage inconnu.');
  const current = (await getSettings())[req.params.key] || {};
  const next = { ...current };
  for (const [k, rule] of Object.entries(rules)) {
    const v = (req.body || {})[k];
    if (v === undefined) continue;
    if (rule === 'bool') { next[k] = Boolean(v); continue; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < rule[0] || n > rule[1]) throw bad(`Valeur invalide pour ${k}.`);
    next[k] = n;
  }
  if (req.params.key === 'booking' && req.body && req.body.launchDate !== undefined) {
    if (!isDateStr(req.body.launchDate)) throw bad('Date de lancement invalide.');
    next.launchDate = req.body.launchDate;
  }
  if (req.params.key === 'studio' && next.closeHour <= next.openHour) throw bad('L’heure de fermeture doit suivre l’ouverture.');
  await db.withTx(async (c) => {
    await setSetting(c, req.params.key, next);
    await audit(c, req, 'settings.update', 'settings', req.params.key, { avant: current, après: next });
  });
  res.json({ settings: await getSettings() });
}));

module.exports = router;
