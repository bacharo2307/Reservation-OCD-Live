'use strict';
// Tests du moteur de réservation sur un vrai PostgreSQL : concurrence, expiration, paiements idempotents.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupDb, teardown, slot, contact } = require('./helpers');

let pool;
let booking;
let payments;
let jobs;
let adminSvc;

before(async () => {
  ({ pool } = await setupDb());
  booking = require('../src/services/booking');
  payments = require('../src/services/payments');
  jobs = require('../src/services/jobs');
  adminSvc = require('../src/services/admin');
});
after(teardown);
beforeEach(async () => {
  await pool.query('TRUNCATE payments, webhook_events, notifications, jobs, audit_log, bookings, customers, blocked_days RESTART IDENTITY CASCADE');
});

const settle = (n, fn) => Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)));
const activeCount = async () => (await pool.query(`SELECT count(*)::int AS n FROM bookings WHERE status IN ('hold','pending_payment','quote','confirmed')`)).rows[0].n;
const fakeReq = { admin: { id: null, email: 'test@ocd.local', role: 'super_admin' }, ip: '127.0.0.1' };

test('100 demandes simultanées sur le même créneau du studio : une seule réussit', async () => {
  const start = slot(10, '10:00');
  const results = await settle(100, () => booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start }));
  const ok = results.filter((r) => r.status === 'fulfilled');
  const ko = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1);
  assert.equal(ko.length, 99);
  for (const r of ko) assert.equal(r.reason.code, 'slot_taken', r.reason.message);
  assert.equal(await activeCount(), 1);
  // Le conflit propose les prochains horaires libres.
  assert.equal(ko[0].reason.extra.alternatives.length, 3);
});

test('100 demandes à distance simultanées : autant de réussites que d’assistantes (2)', async () => {
  const start = slot(11, '14:00');
  const results = await settle(100, () => booking.createHold({ mode: 'distance', packageId: 'remote-starter', start }));
  const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value.booking);
  assert.equal(ok.length, 2);
  assert.notEqual(ok[0].resource_id, ok[1].resource_id);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.code === 'slot_taken').length, 98);
});

test('créneaux différents en parallèle : tous acceptés, et une session à distance ne bloque pas le studio', async () => {
  const starts = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'].map((h) => slot(12, h));
  const studio = await settle(starts.length, (i) => booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: starts[i] }));
  const remote = await settle(2, () => booking.createHold({ mode: 'distance', packageId: 'remote-starter', start: starts[0] }));
  assert.ok(studio.every((r) => r.status === 'fulfilled'));
  assert.ok(remote.every((r) => r.status === 'fulfilled'));
  assert.equal(await activeCount(), 8);
});

test('la marge de préparation de 30 minutes est respectée', async () => {
  await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(13, '10:00') }); // 10h00–11h30
  await assert.rejects(booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(13, '11:30') }), { code: 'slot_taken' });
  await assert.rejects(booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(13, '08:30') }), { code: 'slot_taken' });
  await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(13, '12:00') });
  await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(13, '08:00') });
});

test('même clé d’idempotence répétée 20 fois en parallèle : une seule réservation', async () => {
  const start = slot(14, '09:00');
  const results = await settle(20, () => booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start, idempotencyKey: 'cle-unique-123456' }));
  assert.ok(results.every((r) => r.status === 'fulfilled'), JSON.stringify(results.filter((r) => r.status === 'rejected').map((r) => r.reason.message)));
  assert.equal(new Set(results.map((r) => r.value.booking.id)).size, 1);
  assert.equal(await activeCount(), 1);
});

test('horaires invalides refusés (hors studio, non aligné, jour bloqué)', async () => {
  await assert.rejects(booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(15, '19:00') }), /heures du studio/);
  await assert.rejects(booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(15, '10:10') }), /invalide/);
  await assert.rejects(booking.createHold({ mode: 'distance', packageId: 'decouverte', start: slot(15, '10:00') }), /pas proposé/);
  const day = slot(15, '00:00').slice(0, 10);
  await pool.query('INSERT INTO blocked_days (day) VALUES ($1)', [day]);
  await assert.rejects(booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(15, '10:00') }), { code: 'day_closed' });
});

test('un créneau retenu expiré est libéré automatiquement', async () => {
  const start = slot(16, '10:00');
  const { booking: first } = await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start });
  await pool.query(`UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = $1`, [first.id]);
  const { booking: second } = await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start });
  assert.notEqual(second.id, first.id);
  const { rows } = await pool.query('SELECT status FROM bookings WHERE id = $1', [first.id]);
  assert.equal(rows[0].status, 'expired');
});

test('100 réservations temporaires qui expirent en même temps : le worker les libère toutes', async () => {
  const starts = [];
  for (let d = 20; d < 37; d++) for (const h of ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']) starts.push(slot(d, h));
  const created = await settle(100, (i) => booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: starts[i] }));
  assert.equal(created.filter((r) => r.status === 'fulfilled').length, 100);
  await pool.query(`UPDATE bookings SET expires_at = now() - interval '1 second'`);
  const runs = await Promise.all([jobs.runOnce(), jobs.runOnce()]); // deux workers en parallèle
  assert.equal(runs[0].expired + runs[1].expired, 100);
  assert.equal(await activeCount(), 0);
});

test('parcours complet : informations, confirmation, paiement idempotent, notification', async () => {
  const { booking: hold } = await booking.createHold({ mode: 'distance', packageId: 'remote-business', start: slot(17, '09:00') });
  await assert.rejects(booking.saveContact(hold.id, contact({ phone: '12', sector: 'inconnu' })), (e) => Boolean(e.extra.fields.phone && e.extra.fields.sector));
  await booking.saveContact(hold.id, contact());
  const confirmed = await booking.confirmBooking(hold.id);
  assert.equal(confirmed.status, 'pending_payment');
  assert.match(confirmed.ref, /^OCD-\d{4}$/);
  const again = await booking.confirmBooking(hold.id); // double clic
  assert.equal(again.ref, confirmed.ref);

  const { rows: notes } = await pool.query(`SELECT * FROM notifications WHERE booking_id = $1`, [hold.id]);
  assert.equal(notes.length, 1);
  assert.match(notes[0].body, /Mireille Ndongo \(Boutique Élégance, mode, vêtements et chaussures\) a réservé le .+ de 9h00 à 13h00, heure de Lomé\. Sera à distance depuis Douala \(Cameroun\)\. Assistante 1 l'accompagne\. Va présenter : chaussures pour femmes\. Package Remote Business · 35\s000\sFCFA/);

  // Double clic sur « Payer » avec deux clés différentes : un seul paiement ouvert.
  const [p1, p2] = await Promise.all([
    payments.startPayment(hold.id, { method: 'mobile_money_tg', idempotencyKey: 'pay-key-aaaaaaaa' }),
    payments.startPayment(hold.id, { method: 'mobile_money_tg', idempotencyKey: 'pay-key-bbbbbbbb' }),
  ]);
  assert.equal(p1.payment.id, p2.payment.id);

  // Le prestataire confirme deux fois (deux événements distincts) : un seul encaissement.
  await payments.completeDemo(hold.id, p1.payment.provider_ref);
  await payments.completeDemo(hold.id, p1.payment.provider_ref);
  const { rows: pays } = await pool.query(`SELECT status FROM payments WHERE booking_id = $1`, [hold.id]);
  assert.deepEqual(pays.map((p) => p.status), ['succeeded']);
  const { rows: [b] } = await pool.query('SELECT status FROM bookings WHERE id = $1', [hold.id]);
  assert.equal(b.status, 'confirmed');
  const { rows: [n] } = await pool.query(`SELECT count(*)::int AS n FROM notifications WHERE booking_id = $1 AND kind = 'confirmed'`, [hold.id]);
  assert.equal(n.n, 1);
  // Emails mis en file (équipe + client), traités par le worker sans configuration email.
  const { rows: [j] } = await pool.query(`SELECT count(*)::int AS n FROM jobs`);
  assert.ok(j.n >= 4);
  await jobs.runOnce();
  const { rows: [left] } = await pool.query(`SELECT count(*)::int AS n FROM jobs WHERE status = 'pending'`);
  assert.equal(left.n, 0);
});

test('webhook dupliqué ou mal signé', async () => {
  const { booking: hold } = await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start: slot(18, '10:00') });
  await booking.saveContact(hold.id, contact({ country: 'Togo', city: 'Lomé' }));
  await booking.confirmBooking(hold.id);
  const { payment } = await payments.startPayment(hold.id, { method: 'card', idempotencyKey: 'pay-key-cccccccc' });
  const providers = require('../src/services/payments/providers');
  const body = Buffer.from(JSON.stringify({ id: 'evt_same', type: 'payment.succeeded', providerRef: payment.provider_ref, amount: 20000 }));
  const sig = providers.registry.demo.sign(body);
  const r1 = await payments.handleWebhook('demo', body, { 'x-demo-signature': sig });
  const r2 = await payments.handleWebhook('demo', body, { 'x-demo-signature': sig });
  assert.ok(r1.succeeded);
  assert.ok(r2.duplicate);
  await assert.rejects(payments.handleWebhook('demo', body, { 'x-demo-signature': 'faux' }), { status: 401 });
});

test('paiement non reçu à temps : créneau libéré et équipe prévenue ; paiement tardif signalé', async () => {
  const start = slot(19, '14:00');
  const { booking: hold } = await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start });
  await booking.saveContact(hold.id, contact({ country: 'Togo', city: 'Lomé' }));
  await booking.confirmBooking(hold.id);
  const { payment } = await payments.startPayment(hold.id, { method: 'mobile_money_tg', idempotencyKey: 'pay-key-dddddddd' });
  await pool.query(`UPDATE bookings SET expires_at = now() - interval '1 second' WHERE id = $1`, [hold.id]);
  await jobs.runOnce();
  const { rows: [b] } = await pool.query('SELECT status FROM bookings WHERE id = $1', [hold.id]);
  assert.equal(b.status, 'expired');
  // Un autre client prend le créneau, puis le premier paiement arrive.
  await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start });
  const r = await payments.completeDemo(hold.id, payment.provider_ref);
  assert.ok(r.latePayment);
  const { rows } = await pool.query(`SELECT kind FROM notifications WHERE booking_id = $1 ORDER BY id`, [hold.id]);
  assert.deepEqual(rows.map((x) => x.kind), ['pending_payment', 'expired', 'late_payment']);
});

test('Visibility Premium : demande sur devis, pas de paiement, confirmée par l’équipe', async () => {
  const { booking: hold } = await booking.createHold({ mode: 'distance', packageId: 'visibility-premium', start: slot(21, '11:00') });
  assert.equal(hold.price, null);
  await booking.saveContact(hold.id, contact());
  const b = await booking.confirmBooking(hold.id);
  assert.equal(b.status, 'quote');
  assert.equal(b.expires_at, null);
  await assert.rejects(payments.startPayment(hold.id, { method: 'card', idempotencyKey: 'pay-key-eeeeeeee' }), { code: 'invalid' });
  const done = await adminSvc.confirm(fakeReq, hold.id);
  assert.equal(done.status, 'confirmed');
});

test('équipe : report et changement d’assistante protégés contre les chevauchements', async () => {
  const mk = async (start, pkg = 'remote-starter') => {
    const { booking: h } = await booking.createHold({ mode: 'distance', packageId: pkg, start });
    await booking.saveContact(h.id, contact());
    return booking.confirmBooking(h.id);
  };
  const a = await mk(slot(22, '10:00')); // assistante 1
  const b = await mk(slot(22, '10:00')); // assistante 2
  assert.notEqual(a.resource_id, b.resource_id);
  await assert.rejects(adminSvc.assign(fakeReq, a.id, b.resource_id), { code: 'resource_busy' });
  const c = await mk(slot(22, '14:00'));
  // Reporter c à 10h : les deux assistantes sont prises.
  await assert.rejects(adminSvc.reschedule(fakeReq, c.id, slot(22, '10:00')), { code: 'slot_taken' });
  const moved = await adminSvc.reschedule(fakeReq, c.id, slot(22, '16:00'));
  assert.equal(new Date(moved.starts_at).toISOString(), slot(22, '16:00'));
  // Reporter sur un horaire qui chevauche sa propre ancienne place est accepté.
  const moved2 = await adminSvc.reschedule(fakeReq, c.id, slot(22, '16:30'));
  assert.equal(new Date(moved2.starts_at).toISOString(), slot(22, '16:30'));
  const cancelled = await adminSvc.cancel(fakeReq, a.id, 'test');
  assert.equal(cancelled.status, 'cancelled');
  // Le créneau libéré est de nouveau réservable.
  await mk(slot(22, '10:00'));
  // Seules les actions réussies sont historisées : 2 reports + 1 annulation.
  const { rows } = await pool.query(`SELECT action FROM audit_log ORDER BY id`);
  assert.deepEqual(rows.map((r) => r.action), ['booking.reschedule', 'booking.reschedule', 'booking.cancel']);
});
