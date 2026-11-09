'use strict';
// Données de démonstration pour présenter l'application avant le lancement.
//   npm run seed:demo   → ajoute 8 réservations d'exemple (marquées is_demo)
//   npm run demo:reset  → supprime toutes les données de démonstration
// Les réservations passent par le vrai moteur (mêmes contrôles, mêmes notifications).

const db = require('../db');
const { getSettings } = require('../lib/settings');
const booking = require('../services/booking');
const payments = require('../services/payments');

const ROWS = [
  [0, '10:00', 'presentiel', 'decouverte', 'paid', { name: 'Awa Mensah', company: 'Saveurs d’Awa', sector: 'Alimentation et restauration', products: 'plats cuisinés (riz, sauce arachide, akoumé)', country: 'Togo', city: 'Lomé', phone: '+228 90 00 00 01', email: '' }],
  [0, '14:00', 'presentiel', 'business-plus', 'paid', { name: 'Koffi Agbeko', company: 'KA Électronique', sector: 'Téléphones et électronique', products: 'smartphones et accessoires', country: 'Togo', city: 'Lomé', phone: '+228 90 00 00 02', email: '' }],
  [0, '09:00', 'distance', 'remote-business', 'paid', { name: 'Mireille Ndongo', company: 'Boutique Élégance', sector: 'Mode, vêtements et chaussures', products: 'chaussures pour femmes', country: 'Cameroun', city: 'Douala', phone: '+237 690 00 00 03', email: '' }],
  [1, '15:00', 'distance', 'remote-starter', 'pending', { name: 'Fatou Diallo', company: 'Fatou Cosmetics', sector: 'Beauté et cosmétiques', products: 'crèmes et savons naturels', country: 'Sénégal', city: 'Dakar', phone: '+221 77 000 00 04', email: '' }],
  [2, '11:00', 'distance', 'visibility-premium', 'quote', { name: 'Yao Kouassi', company: 'Pagne Royal', sector: 'Mode, vêtements et chaussures', products: 'pagnes et tenues sur mesure', country: "Côte d'Ivoire", city: 'Abidjan', phone: '+225 07 00 00 00 05', email: '' }],
  [4, '08:00', 'presentiel', 'business-plus', 'paid', { name: 'Edem Lawson', company: 'Lawson Agro', sector: 'Agriculture et produits locaux', products: 'huile de palme et gari', country: 'Togo', city: 'Kpalimé', phone: '+228 90 00 00 06', email: '' }],
  [4, '12:30', 'presentiel', 'business-plus', 'paid', { name: 'Ama Dossou', company: 'Ama Déco', sector: 'Maison et décoration', products: 'coussins et paniers tressés', country: 'Togo', city: 'Lomé', phone: '+228 90 00 00 07', email: '' }],
  [4, '17:00', 'presentiel', 'pack-mensuel', 'paid', { name: 'Kodjo Amouzou', company: 'Kodjo Fitness', sector: 'Santé et bien-être', products: 'programmes sportifs et compléments', country: 'Togo', city: 'Lomé', phone: '+228 90 00 00 08', email: '' }],
];

async function seed() {
  const s = await getSettings();
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const base = s.booking.launchDate > tomorrow ? s.booking.launchDate : tomorrow;
  const [y, m, d] = base.split('-').map(Number);
  let n = 0;
  for (const [offset, hhmm, mode, packageId, kind, contact] of ROWS) {
    const [h, mi] = hhmm.split(':').map(Number);
    const start = new Date(Date.UTC(y, m - 1, d + offset, h, mi)).toISOString();
    try {
      const { booking: hold } = await booking.createHold({ mode, packageId, start, source: 'admin' });
      await db.query('UPDATE bookings SET is_demo = true WHERE id = $1', [hold.id]);
      await booking.saveContact(hold.id, contact);
      await booking.confirmBooking(hold.id);
      if (kind === 'pending') await db.query(`UPDATE bookings SET expires_at = now() + interval '30 days' WHERE id = $1`, [hold.id]);
      if (kind === 'paid') await db.withTx((c) => payments.markManualPaid(c, hold.id, 'démo'));
      n += 1;
    } catch (err) {
      console.warn(`Ignoré (${contact.name}) : ${err.message}`);
    }
  }
  console.log(`${n} réservations de démonstration ajoutées à partir du ${base}.`);
}

async function reset() {
  const r = await db.withTx(async (c) => {
    const ids = (await c.query('SELECT id FROM bookings WHERE is_demo')).rows.map((x) => x.id);
    if (!ids.length) return 0;
    await c.query('DELETE FROM payments WHERE booking_id = ANY($1)', [ids]);
    await c.query('DELETE FROM notifications WHERE booking_id = ANY($1)', [ids]);
    await c.query(`DELETE FROM jobs WHERE payload->>'bookingId' = ANY($1)`, [ids]);
    await c.query('DELETE FROM bookings WHERE id = ANY($1)', [ids]);
    await c.query('DELETE FROM customers c WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id)');
    return ids.length;
  });
  console.log(`${r} réservations de démonstration supprimées.`);
}

// Ajoute les données seulement si aucune donnée de démonstration n'existe (poste local).
async function seedIfEmpty() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM bookings WHERE is_demo');
  if (rows[0].n > 0) return false;
  await seed();
  return true;
}

module.exports = { seed, reset, seedIfEmpty };

if (require.main === module) {
  const cmd = process.argv[2];
  (cmd === 'seed' ? seed() : cmd === 'reset' ? reset() : Promise.reject(new Error('Usage : demo-data.js seed|reset')))
    .then(() => db.close())
    .catch(async (err) => { console.error(err.message); await db.close(); process.exit(1); });
}
