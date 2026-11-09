'use strict';
// Notifications de l'équipe (dans l'espace équipe) + emails mis en file pour le worker.
// Chaque notification est créée dans la même transaction que l'événement qui la déclenche.

const { fmtDay, fmtTime, fmtPrice } = require('./time');

function assistantPhrase(b) {
  return b.resource_name ? `${b.resource_name} l'accompagne.` : 'Assistante à affecter.';
}

function describe(b) {
  const c = b.contact || {};
  const start = new Date(b.starts_at).getTime();
  const end = new Date(b.ends_at).getTime();
  const who = `${c.name} (${c.company}, ${String(c.sector || '').toLowerCase()})`;
  const when = `le ${fmtDay(start)} de ${fmtTime(start)} à ${fmtTime(end)}, heure de Lomé`;
  const where = b.mode === 'presentiel'
    ? 'Viendra au studio OCD de Lomé.'
    : `Sera à distance depuis ${c.city} (${c.country}). ${assistantPhrase(b)}`;
  const sells = c.products ? ` Va présenter : ${c.products}.` : '';
  const pkg = `${b.package_name}${b.sessions > 1 ? ` (${b.sessions} lives)` : ''} · ${fmtPrice(b.price)}`;
  return { who, when, where, sells, pkg, start };
}

function notificationText(b, kind, extra = {}) {
  const d = describe(b);
  const c = b.contact || {};
  switch (kind) {
    case 'pending_payment':
      return { title: `Nouvelle réservation ${b.ref} — en attente de paiement`, body: `${d.who} a réservé ${d.when}. ${d.where}${d.sells} Package ${d.pkg}. Paiement à recevoir.` };
    case 'confirmed':
      return { title: `Réservation ${b.ref} confirmée`, body: `${d.who} a réservé ${d.when}. ${d.where}${d.sells} Package ${d.pkg}, payé.` };
    case 'quote':
      return { title: `Demande ${b.package_name} ${b.ref} à traiter`, body: `${d.who} demande un devis pour un live ${d.when}. ${d.where}${d.sells} Le créneau est bloqué en attendant votre réponse.` };
    case 'quote_accepted':
      return { title: `Demande ${b.ref} confirmée`, body: `La demande ${b.package_name} de ${c.name} (${c.company}) pour le ${fmtDay(d.start)} à ${fmtTime(d.start)} est confirmée.` };
    case 'expired':
      return { title: `Paiement non reçu — ${b.ref} libérée`, body: `${c.name} (${c.company}) n'a pas payé à temps pour le ${fmtDay(d.start)} à ${fmtTime(d.start)}. Le créneau est de nouveau libre.` };
    case 'cancelled':
      return { title: `Réservation ${b.ref} annulée`, body: `La réservation de ${c.name} (${c.company}) du ${fmtDay(d.start)} à ${fmtTime(d.start)} est annulée.${extra.reason ? ' Motif : ' + extra.reason + '.' : ''} Le créneau est libéré.` };
    case 'rescheduled':
      return { title: `Réservation ${b.ref} reportée`, body: `${d.who} : live déplacé ${d.when}. ${d.where}` };
    case 'late_payment':
      return { title: `Paiement reçu après expiration — ${b.ref}`, body: `${c.name} (${c.company}) a payé ${fmtPrice(b.price)} mais son créneau du ${fmtDay(d.start)} à ${fmtTime(d.start)} a déjà été repris. À traiter : nouveau créneau ou remboursement.` };
    default:
      return { title: kind, body: `${d.who} ${d.when}.` };
  }
}

// Charge la réservation avec le nom de la ressource (pour les textes).
async function loadForText(client, bookingId) {
  const { rows } = await client.query(
    `SELECT b.*, r.name AS resource_name FROM bookings b JOIN resources r ON r.id = b.resource_id WHERE b.id = $1`,
    [bookingId]
  );
  return rows[0];
}

async function notify(client, bookingId, kind, extra) {
  const b = await loadForText(client, bookingId);
  if (!b) return;
  const { title, body } = notificationText(b, kind, extra);
  await client.query('INSERT INTO notifications (kind, booking_id, title, body) VALUES ($1, $2, $3, $4)', [kind, bookingId, title, body]);
  await client.query(`INSERT INTO jobs (type, payload) VALUES ('email.team', $1)`, [{ bookingId, kind, title, body }]);
  const customerKinds = ['pending_payment', 'confirmed', 'quote', 'quote_accepted', 'expired', 'cancelled', 'rescheduled'];
  if (b.contact && b.contact.email && customerKinds.includes(kind)) {
    await client.query(`INSERT INTO jobs (type, payload) VALUES ('email.customer', $1)`, [{ bookingId, kind }]);
  }
}

module.exports = { notify, notificationText, describe, loadForText };
