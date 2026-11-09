'use strict';
// Calcul des disponibilités à partir des réservations réellement enregistrées.
// Ce calcul sert à l'affichage ; la garantie finale reste la contrainte d'exclusion PostgreSQL.

const db = require('../db');
const { getSettings } = require('../lib/settings');
const { MIN, DAY, dayStart, dateStr, isDateStr } = require('../lib/time');
const { bad, notFound } = require('../lib/errors');

const ACTIVE_SQL = `status IN ('hold','pending_payment','quote','confirmed')
  AND NOT (status IN ('hold','pending_payment') AND expires_at <= now())`;

const MODES = ['presentiel', 'distance'];

function assertMode(mode) {
  if (!MODES.includes(mode)) throw bad('Mode de participation invalide.');
}

async function getPackage(client, id) {
  const { rows } = await (client || db).query('SELECT * FROM packages WHERE id = $1', [id]);
  return rows[0] || null;
}

async function getActivePackage(client, id, mode) {
  const pkg = await getPackage(client, id);
  if (!pkg || !pkg.active) throw notFound('Ce package n’est plus disponible.');
  if (!pkg.modes.includes(mode)) throw bad('Ce package n’est pas proposé pour ce mode de participation.');
  return pkg;
}

// Prix appliqué pour un live à cette date (promotion comprise). NULL = sur devis.
function priceFor(pkg, mode, startMs) {
  if (pkg.is_quote) return null;
  const base = mode === 'presentiel' ? pkg.price_presentiel : pkg.price_distance;
  if (base == null) return null;
  const ds = dateStr(startMs);
  const from = pkg.promo_from ? dateStr(new Date(pkg.promo_from).getTime()) : null;
  const to = pkg.promo_to ? dateStr(new Date(pkg.promo_to).getTime()) : null;
  if (pkg.promo_percent && from && to && ds >= from && ds <= to) {
    return Math.round((base * (100 - pkg.promo_percent)) / 100);
  }
  return base;
}

async function resourcesFor(client, mode) {
  const kind = mode === 'presentiel' ? 'studio' : 'assistant';
  const { rows } = await (client || db).query(
    'SELECT id, name FROM resources WHERE kind = $1 AND active ORDER BY sort, id', [kind]
  );
  return rows;
}

async function loadBusy(client, resourceIds, fromMs, toMs, ignoreId) {
  if (!resourceIds.length) return [];
  const { rows } = await (client || db).query(
    `SELECT id, resource_id, status, lower(during) AS s, upper(during) AS e
       FROM bookings
      WHERE resource_id = ANY($1) AND during && tstzrange($2::timestamptz, $3::timestamptz)
        AND ${ACTIVE_SQL} AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [resourceIds, new Date(fromMs).toISOString(), new Date(toMs).toISOString(), ignoreId || null]
  );
  return rows.map((r) => ({ id: r.id, resource: r.resource_id, status: r.status, s: new Date(r.s).getTime(), e: new Date(r.e).getTime() }));
}

async function loadBlocked(client, fromDs, toDs) {
  const { rows } = await (client || db).query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM blocked_days WHERE day BETWEEN $1 AND $2`, [fromDs, toDs]
  );
  return new Set(rows.map((r) => r.day));
}

function slotState(start, durMin, bufferMin, resources, busy) {
  const blockEnd = start + (durMin + bufferMin) * MIN;
  let heldOnly = true;
  for (const r of resources) {
    const clash = busy.filter((b) => b.resource === r.id && b.s < blockEnd && start < b.e);
    if (!clash.length) return { state: 'free', resourceId: r.id };
    if (clash.some((b) => b.status !== 'hold')) heldOnly = false;
  }
  return { state: resources.length && heldOnly ? 'held' : 'taken' };
}

// Règles horaires communes (affichage et réservation).
function dayWindow(settings, ds) {
  const d0 = dayStart(ds);
  return { open: d0 + settings.studio.openHour * 60 * MIN, close: d0 + settings.studio.closeHour * 60 * MIN };
}

function bookableRange(settings, now) {
  const leadMin = settings.booking.leadMin ?? 60;
  const launch = settings.booking.launchDate;
  const today = dateStr(now);
  const first = launch > today ? launch : today;
  const last = dateStr(dayStart(today) + (settings.booking.horizonDays || 120) * DAY);
  return { first, last, earliestStart: now + leadMin * MIN };
}

function computeDay(settings, ds, durMin, now, resources, busy, blocked) {
  const { open, close } = dayWindow(settings, ds);
  const range = bookableRange(settings, now);
  const out = [];
  const step = settings.studio.stepMin * MIN;
  for (let s = open; s + durMin * MIN <= close; s += step) {
    let st;
    if (ds < range.first || ds > range.last) st = { state: 'closed' };
    else if (blocked.has(ds)) st = { state: 'closed' };
    else if (s < range.earliestStart) st = { state: 'past' };
    else st = slotState(s, durMin, settings.studio.bufferMin, resources, busy);
    out.push({ start: s, end: s + durMin * MIN, state: st.state, resourceId: st.resourceId });
  }
  return out;
}

function statusOfDay(slots, ds, range, blocked) {
  if (ds < range.first || ds > range.last) return 'disabled';
  if (blocked.has(ds)) return 'closed';
  const free = slots.filter((s) => s.state === 'free').length;
  if (!free) return slots.every((s) => s.state === 'past') ? 'disabled' : 'full';
  return free <= 4 ? 'few' : 'open';
}

async function monthAvailability({ mode, packageId, month }) {
  assertMode(mode);
  if (!/^\d{4}-\d{2}$/.test(month || '')) throw bad('Mois invalide (AAAA-MM).');
  const settings = await getSettings();
  const pkg = await getActivePackage(null, packageId, mode);
  const [y, m] = month.split('-').map(Number);
  const first = Date.UTC(y, m - 1, 1);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const resources = await resourcesFor(null, mode);
  const busy = await loadBusy(null, resources.map((r) => r.id), first - DAY, first + (days + 1) * DAY);
  const blocked = await loadBlocked(null, dateStr(first), dateStr(first + (days - 1) * DAY));
  const now = Date.now();
  const range = bookableRange(settings, now);
  const out = [];
  for (let d = 0; d < days; d++) {
    const ds = dateStr(first + d * DAY);
    const slots = computeDay(settings, ds, pkg.duration_min, now, resources, busy, blocked);
    out.push({ date: ds, status: statusOfDay(slots, ds, range, blocked), free: slots.filter((s) => s.state === 'free').length });
  }
  return { month, mode, packageId, days: out };
}

async function dayAvailability({ mode, packageId, date, ignoreId }) {
  assertMode(mode);
  if (!isDateStr(date)) throw bad('Date invalide (AAAA-MM-JJ).');
  const settings = await getSettings();
  const pkg = await getActivePackage(null, packageId, mode);
  const resources = await resourcesFor(null, mode);
  const d0 = dayStart(date);
  const busy = await loadBusy(null, resources.map((r) => r.id), d0 - DAY, d0 + 2 * DAY, ignoreId);
  const blocked = await loadBlocked(null, date, date);
  const slots = computeDay(settings, date, pkg.duration_min, Date.now(), resources, busy, blocked);
  return {
    date, mode, packageId, durationMin: pkg.duration_min,
    slots: slots.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString(), state: s.state })),
  };
}

// Les prochains horaires libres après `fromMs` (sur 21 jours au maximum).
async function findAlternatives(client, { mode, pkg, fromMs, count = 3, ignoreId }) {
  const settings = await getSettings(client);
  const resources = await resourcesFor(client, mode);
  const now = Date.now();
  const startDay = dayStart(dateStr(fromMs));
  const busy = await loadBusy(client, resources.map((r) => r.id), startDay - DAY, startDay + 22 * DAY, ignoreId);
  const blocked = await loadBlocked(client, dateStr(startDay), dateStr(startDay + 21 * DAY));
  const out = [];
  for (let d = 0; d < 21 && out.length < count; d++) {
    const ds = dateStr(startDay + d * DAY);
    for (const s of computeDay(settings, ds, pkg.duration_min, now, resources, busy, blocked)) {
      if (s.state === 'free' && s.start > fromMs) {
        out.push({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });
        if (out.length >= count) break;
      }
    }
  }
  return out;
}

module.exports = {
  ACTIVE_SQL, MODES, assertMode, getPackage, getActivePackage, priceFor, resourcesFor, loadBusy,
  dayWindow, bookableRange, monthAvailability, dayAvailability, findAlternatives,
};
