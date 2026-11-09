'use strict';
// Le studio vit à l'heure de Lomé (Africa/Lome = GMT toute l'année, sans heure d'été).
// Une journée « Lomé » correspond donc exactement à une journée UTC.

const TZ = 'Africa/Lome';
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const cache = new Map();
function fmt(ms, opts, tz = TZ) {
  const key = tz + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, new Intl.DateTimeFormat('fr-FR', { timeZone: tz, ...opts }));
  return cache.get(key).format(new Date(ms));
}

const dayStart = (ds) => {
  const [y, m, d] = ds.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const dateStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const isDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(dayStart(s)) && dateStr(dayStart(s)) === s;

function fmtTime(ms, tz = TZ) {
  return fmt(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, tz).replace(':', 'h').replace(/^0/, '');
}
function fmtDay(ms) {
  return fmt(ms, { weekday: 'long', day: 'numeric', month: 'long' }).replace(/(^|\s)1(\s)/, '$11er$2');
}
function fmtDayYear(ms) {
  return fmt(ms, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/(^|\s)1(\s)/, '$11er$2');
}
function fmtPrice(n) {
  // Espaces insécables : « 35 000 FCFA » ne se coupe jamais en fin de ligne.
  return n == null ? 'sur devis' : new Intl.NumberFormat('fr-FR').format(n).replace(/ /g, ' ') + ' FCFA';
}
function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + 'h' + (m ? String(m).padStart(2, '0') : '');
}

module.exports = { TZ, MIN, DAY, dayStart, dateStr, isDateStr, fmtTime, fmtDay, fmtDayYear, fmtPrice, fmtDuration };
