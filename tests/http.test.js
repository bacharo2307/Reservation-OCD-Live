'use strict';
// Tests HTTP de bout en bout : API publique, sécurité de l'espace équipe, en-têtes de cache.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupDb, teardown, slot, contact } = require('./helpers');

let pool;
let server;
let base;

before(async () => {
  ({ pool } = await setupDb());
  const { createApp } = require('../src/app');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await teardown();
});

const api = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* HTML */ }
  return { status: res.status, json, text, headers: res.headers };
};

test('santé, configuration, packages, pages', async () => {
  const h = await api('/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.json.db, 'ok');
  assert.equal(h.headers.get('cache-control'), 'no-store');
  const c = await api('/api/config');
  assert.equal(c.json.brand.channel, 'House of Challenge');
  const p = await api('/api/packages?mode=distance');
  assert.deepEqual(p.json.packages.map((x) => x.id), ['remote-starter', 'remote-business', 'visibility-premium', 'pack-mensuel']);
  const home = await api('/');
  assert.equal(home.status, 200);
  assert.ok(!home.text.includes('__V__'));
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
});

test('100 requêtes HTTP simultanées sur le même créneau : 1 × 201, 99 × 409', async () => {
  const start = slot(30, '10:00');
  const results = await Promise.all(Array.from({ length: 100 }, () =>
    api('/api/holds', { method: 'POST', body: { mode: 'presentiel', packageId: 'business-plus', start } })));
  const codes = results.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 1);
  assert.equal(codes.filter((c) => c === 409).length, 99);
  const conflict = results.find((r) => r.status === 409);
  assert.equal(conflict.json.error.code, 'slot_taken');
  assert.ok(Array.isArray(conflict.json.error.alternatives));
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM bookings WHERE status = 'hold'`);
  assert.equal(rows[0].n, 1);
});

test('parcours client complet par HTTP (paiement démo)', async () => {
  const day = slot(31, '00:00').slice(0, 10);
  const month = day.slice(0, 7);
  const m = await api(`/api/availability/month?mode=presentiel&package=decouverte&month=${month}`);
  assert.equal(m.status, 200);
  assert.ok(m.json.days.find((d) => d.date === day).status === 'open');
  const d = await api(`/api/availability/day?mode=presentiel&package=decouverte&date=${day}`);
  const free = d.json.slots.find((s) => s.state === 'free');
  const hold = await api('/api/holds', { method: 'POST', body: { mode: 'presentiel', packageId: 'decouverte', start: free.start }, headers: { 'idempotency-key': 'http-key-0001' } });
  assert.equal(hold.status, 201);
  const { id } = hold.json.booking;
  const tk = { 'x-booking-token': hold.json.token };
  assert.equal((await api(`/api/bookings/${id}`)).status, 401);
  assert.equal((await api(`/api/bookings/${id}`, { headers: { 'x-booking-token': 'x'.repeat(43) } })).status, 401);
  const bad = await api(`/api/bookings/${id}/contact`, { method: 'PUT', body: { name: 'A' }, headers: tk });
  assert.equal(bad.status, 400);
  assert.ok(bad.json.error.fields.name);
  assert.equal((await api(`/api/bookings/${id}/contact`, { method: 'PUT', body: contact({ country: 'Togo', city: 'Lomé' }), headers: tk })).status, 200);
  const conf = await api(`/api/bookings/${id}/confirm`, { method: 'POST', headers: tk });
  assert.equal(conf.json.booking.status, 'pending_payment');
  const pay = await api(`/api/bookings/${id}/payments`, { method: 'POST', body: { method: 'mobile_money_tg' }, headers: { ...tk, 'idempotency-key': 'http-pay-0001' } });
  assert.equal(pay.status, 200);
  const done = await api(`/api/bookings/${id}/payments/demo-complete`, { method: 'POST', body: { providerRef: pay.json.payment.providerRef }, headers: tk });
  assert.equal(done.json.booking.status, 'confirmed');
  // Le créneau payé apparaît maintenant comme pris.
  const after = await api(`/api/availability/day?mode=presentiel&package=decouverte&date=${day}`);
  assert.equal(after.json.slots.find((s) => s.start === free.start).state, 'taken');
});

test('webhook : signature obligatoire', async () => {
  const r = await api('/api/webhooks/payments/demo', { method: 'POST', body: { id: 'x', type: 'payment.succeeded', providerRef: 'y' } });
  assert.equal(r.status, 401);
});

test('espace équipe : connexion, verrou anti-CSRF, rôles', async () => {
  const auth = require('../src/lib/auth');
  await auth.createUser(null, { email: 'boss@ocd.test', name: 'Boss', role: 'super_admin', password: 'MotDePasse-Solide-1' });
  await auth.createUser(null, { email: 'aide@ocd.test', name: 'Aide', role: 'assistant', password: 'MotDePasse-Solide-2' });

  assert.equal((await api('/api/admin/dashboard')).status, 401);
  assert.equal((await api('/api/admin/login', { method: 'POST', body: { email: 'boss@ocd.test', password: 'faux-faux-faux' } })).status, 401);

  const login = async (email, password) => {
    const r = await api('/api/admin/login', { method: 'POST', body: { email, password } });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    return { cookie, 'x-ocd-admin': '1' };
  };
  const boss = await login('boss@ocd.test', 'MotDePasse-Solide-1');
  const dash = await api('/api/admin/dashboard', { headers: boss });
  assert.equal(dash.status, 200);
  assert.ok(dash.json.kpis.confirmed >= 1);
  const notes = await api('/api/admin/notifications', { headers: boss });
  assert.ok(notes.json.notifications.some((n) => /a réservé le .+ heure de Lomé/.test(n.body)));

  // Sans l'en-tête anti-CSRF, une écriture est refusée.
  const noCsrf = await api('/api/admin/packages/decouverte', { method: 'PATCH', body: { price_presentiel: 25000 }, headers: { cookie: boss.cookie } });
  assert.equal(noCsrf.status, 403);
  const ok = await api('/api/admin/packages/decouverte', { method: 'PATCH', body: { price_presentiel: 25000 }, headers: boss });
  assert.equal(ok.json.package.price_presentiel, 25000);
  const audit = await api('/api/admin/audit', { headers: boss });
  assert.ok(audit.json.entries.some((e) => e.action === 'package.update'));

  // Une assistante ne peut pas modifier les tarifs ni voir les utilisateurs.
  const aide = await login('aide@ocd.test', 'MotDePasse-Solide-2');
  assert.equal((await api('/api/admin/packages/decouverte', { method: 'PATCH', body: { price_presentiel: 1 }, headers: aide })).status, 403);
  assert.equal((await api('/api/admin/users', { headers: aide })).status, 403);
  assert.equal((await api('/api/admin/bookings', { headers: aide })).status, 200);

  // Un package désactivé disparaît pour les nouveaux clients.
  await api('/api/admin/packages/remote-starter', { method: 'PATCH', body: { active: false }, headers: boss });
  const p = await api('/api/packages?mode=distance');
  assert.ok(!p.json.packages.some((x) => x.id === 'remote-starter'));

  // Verrouillage après 5 échecs.
  for (let i = 0; i < 5; i++) await api('/api/admin/login', { method: 'POST', body: { email: 'aide@ocd.test', password: 'mauvais-mdp' } });
  const locked = await api('/api/admin/login', { method: 'POST', body: { email: 'aide@ocd.test', password: 'MotDePasse-Solide-2' } });
  assert.equal(locked.status, 401);
  assert.match(locked.json.error.message, /bloqué/);
});
