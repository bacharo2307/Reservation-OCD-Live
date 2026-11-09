'use strict';
// Réceptionniste IA : règles imposées par le serveur, avec un faux modèle (aucun appel réel).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { setupDb, teardown, slot } = require('./helpers');

let pool;
let ai;
let server;
let base;
const calls = [];
let script = [];

const fakeClient = {
  beta: {
    messages: {
      async create(params) {
        calls.push(JSON.parse(JSON.stringify(params)));
        const next = script.shift();
        if (!next) return { content: [{ type: 'text', text: 'Très bien.' }], stop_reason: 'end_turn' };
        return typeof next === 'function' ? next(params) : next;
      },
    },
  },
};

before(async () => {
  ({ pool } = await setupDb());
  ai = require('../src/services/ai/receptionist');
  ai.setClient(fakeClient);
  const { createApp } = require('../src/app');
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await teardown();
});
beforeEach(async () => {
  await pool.query('TRUNCATE payments, notifications, jobs, bookings, customers, ai_sessions RESTART IDENTITY CASCADE');
  calls.length = 0;
  script = [];
});

const day = () => slot(9, '00:00').slice(0, 10);
const run = (name, input, state) => ai.runTool(name, input, { state });
const confirmAll = async (state, over = {}) => {
  const v = { name: 'Mireille Ndongo', company: 'Boutique Élégance', sector: 'mode', products: 'chaussures pour femmes', country: 'cameroun', city: 'Douala', phone: '+237 690 00 00 01', ...over };
  for (const [field, value] of Object.entries(v)) await run('note_customer_info', { field, value, confirmed: true }, state);
};

test('le serveur impose l’ordre : créneau retenu, fiche confirmée, récapitulatif, oui explicite', async () => {
  const state = {};
  let r = await run('confirm_booking', { client_confirmed_explicitly: true }, state);
  assert.ok(r.error);

  r = await run('hold_slot', { mode: 'distance', package_id: 'remote-business', date: day(), time: '09:00' }, state);
  assert.equal(r.result.held, true);
  assert.ok(state.bookingId);

  await run('note_customer_info', { field: 'name', value: 'Mireille Ndongo', confirmed: false }, state);
  r = await run('save_customer_info', {}, state);
  assert.ok(r.error);
  assert.ok(r.result.fields.includes('name'));

  await confirmAll(state);
  assert.equal(state.fields.sector.value, 'Mode, vêtements et chaussures');
  assert.equal(state.fields.country.value, 'Cameroun');
  r = await run('save_customer_info', {}, state);
  assert.equal(r.result.saved, true);

  r = await run('confirm_booking', { client_confirmed_explicitly: true }, state);
  assert.match(r.result.error, /get_summary/);

  r = await run('get_summary', {}, state);
  assert.match(r.result.summary, /Mireille Ndongo, de Boutique Élégance/);
  assert.match(r.result.summary, /d’une durée de 4 heures, le .+, de 9 heures à 13 heures, heure de Lomé, soit 10 heures à Douala/);
  assert.match(r.result.summary, /35\s000 francs CFA/);

  // Une correction après le récapitulatif oblige à le relire.
  await run('note_customer_info', { field: 'city', value: 'Yaoundé', confirmed: true }, state);
  await run('save_customer_info', {}, state);
  r = await run('confirm_booking', { client_confirmed_explicitly: true }, state);
  assert.ok(r.error);
  await run('get_summary', {}, state);

  r = await run('confirm_booking', { client_confirmed_explicitly: false }, state);
  assert.ok(r.error);
  r = await run('confirm_booking', { client_confirmed_explicitly: true }, state);
  assert.equal(r.result.status, 'pending_payment');
  assert.equal(r.action.type, 'payment');
  const { rows } = await pool.query('SELECT status, source, contact FROM bookings WHERE id = $1', [state.bookingId]);
  assert.equal(rows[0].status, 'pending_payment');
  assert.equal(rows[0].source, 'voice');
  assert.equal(rows[0].contact.city, 'Yaoundé');
});

test('hold_slot ne prétend jamais réserver un créneau pris, et propose des alternatives', async () => {
  const booking = require('../src/services/booking');
  const start = slot(9, '10:00');
  await booking.createHold({ mode: 'presentiel', packageId: 'decouverte', start });
  const state = {};
  const r = await run('hold_slot', { mode: 'presentiel', package_id: 'decouverte', date: start.slice(0, 10), time: '10:00' }, state);
  assert.equal(r.result.held, false);
  assert.equal(r.result.alternatives.length, 3);
  assert.equal(state.bookingId, null);
  const c = await run('check_availability', { mode: 'presentiel', package_id: 'decouverte', date: start.slice(0, 10), time: '10:00' }, state);
  assert.equal(c.result.available, false);
  const p = await run('list_packages', { mode: 'distance' }, state);
  assert.ok(p.result.packages.some((x) => x.id === 'remote-starter' && x.prix_distance === 15000));
});

test('conversation HTTP : accueil, outil appelé par le modèle, réponse, paramètres du modèle', async () => {
  script = [
    { content: [{ type: 'text', text: 'Bonjour et bienvenue chez OCD LIVE ! Comment puis-je vous aider ?' }], stop_reason: 'end_turn' },
    { content: [{ type: 'text', text: 'Je vérifie pour vous.' }, { type: 'tool_use', id: 'tu_1', name: 'check_availability', input: { mode: 'presentiel', package_id: 'decouverte', date: day(), time: '14:00' } }], stop_reason: 'tool_use' },
    (params) => {
      const last = params.messages.at(-1);
      assert.equal(last.role, 'user');
      assert.equal(last.content[0].type, 'tool_result');
      assert.equal(JSON.parse(last.content[0].content).available, true);
      return { content: [{ type: 'text', text: 'Le créneau de 14 heures est disponible. Voulez-vous le retenir ?' }], stop_reason: 'end_turn' };
    },
  ];
  const start = await fetch(base + '/api/ai/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'voice' }) });
  assert.equal(start.status, 201);
  const s = await start.json();
  assert.match(s.reply, /Bonjour/);

  const p = calls[0];
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.output_config.effort, 'low');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.system[0].cache_control.type, 'ephemeral');
  assert.equal(p.tools.length, 9);
  assert.equal(p.thinking, undefined);
  assert.match(p.messages[0].content, /Nouvelle conversation/);

  const h = { 'content-type': 'application/json', 'x-ai-token': s.session.token };
  assert.equal((await fetch(`${base}/api/ai/sessions/${s.session.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"text":"x"}' })).status, 401);
  const m = await fetch(`${base}/api/ai/sessions/${s.session.id}/messages`, { method: 'POST', headers: h, body: JSON.stringify({ text: 'Je voudrais un live Découverte à 14h.' }) });
  const body = await m.json();
  assert.equal(m.status, 200, JSON.stringify(body));
  assert.equal(body.reply, 'Je vérifie pour vous. Le créneau de 14 heures est disponible. Voulez-vous le retenir ?');

  // L'historique est conservé tel quel (ajout seulement) pour le tour suivant.
  const { rows } = await pool.query('SELECT messages, transcript, turns FROM ai_sessions WHERE id = $1', [s.session.id]);
  assert.equal(rows[0].turns, 1);
  assert.deepEqual(rows[0].messages.map((x) => x.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  assert.equal(rows[0].transcript.length, 3);
});

test('un seul message traité à la fois par conversation', async () => {
  const s = await ai.createSession({ channel: 'text' });
  script = [() => new Promise((r) => setTimeout(() => r({ content: [{ type: 'text', text: 'Un instant.' }], stop_reason: 'end_turn' }), 300))];
  const [a, b] = await Promise.allSettled([ai.sendMessage(s.id, 'Bonjour'), ai.sendMessage(s.id, 'Bonjour ?')]);
  const statuses = [a, b].map((x) => (x.status === 'fulfilled' ? 'ok' : x.reason.code)).sort();
  assert.deepEqual(statuses, ['busy', 'ok']);
});

test('Gemini (offre gratuite) : format Interactions API, outils, signatures conservées', async () => {
  const config = require('../src/config');
  const bodies = [];
  const replies = [
    { status: 'completed', steps: [{ type: 'thought', signature: 'sig-1' }, { type: 'model_output', content: [{ type: 'text', text: 'Bonjour ! Que vendez-vous ?' }] }] },
    { status: 'completed', steps: [{ type: 'thought', signature: 'sig-2' }, { type: 'function_call', id: 'fc_1', name: 'check_availability', arguments: { mode: 'presentiel', package_id: 'decouverte', date: day(), time: '16:00' } }] },
    { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Le créneau de 16 heures est libre.' }] }] },
  ];
  ai.setGeminiFetch(async (url, init) => {
    bodies.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify(replies.shift()) };
  });
  config.ai.provider = 'gemini';
  try {
    const s = await ai.createSession({ channel: 'voice' });
    assert.equal(s.reply, 'Bonjour ! Que vendez-vous ?');
    const r = await ai.sendMessage(s.id, 'Un live Découverte à 16h');
    assert.equal(r.reply, 'Le créneau de 16 heures est libre.');

    const first = bodies[0];
    assert.equal(first.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(first.body.model, 'gemini-3.5-flash-lite');
    assert.equal(first.body.store, false);
    assert.equal(first.body.generation_config.thinking_level, 'minimal');
    assert.match(first.body.system_instruction, /réceptionniste d'OCD LIVE/);
    assert.equal(first.body.tools.length, 9);
    assert.ok(first.body.tools.every((t) => t.type === 'function' && !JSON.stringify(t).includes('additionalProperties')));
    assert.ok(first.headers['x-goog-api-key'] !== undefined);

    // Dernier appel : historique complet, étapes du modèle renvoyées telles quelles, résultat d'outil relié à l'appel.
    const input = bodies[2].body.input;
    assert.deepEqual(input.map((x) => x.type), ['user_input', 'thought', 'model_output', 'user_input', 'thought', 'function_call', 'function_result']);
    assert.equal(input[4].signature, 'sig-2');
    assert.equal(input[6].call_id, 'fc_1');
    assert.equal(input[6].name, 'check_availability');
    assert.equal(JSON.parse(input[6].result[0].text).available, true);
    const { rows } = await pool.query('SELECT state FROM ai_sessions WHERE id = $1', [s.id]);
    assert.equal(rows[0].state.provider, 'gemini');
  } finally {
    config.ai.provider = '';
    ai.setGeminiFetch(null);
  }
});

test('Gemini saturé (quota gratuit) : message clair, la conversation reste utilisable', async () => {
  const config = require('../src/config');
  ai.setGeminiFetch(async () => ({ ok: false, status: 429, text: async () => '{"error":{"code":429}}' }));
  config.ai.provider = 'gemini';
  try {
    await assert.rejects(ai.createSession({ channel: 'text' }), (e) => e.status === 503 && /très demandée/.test(e.message));
  } finally {
    config.ai.provider = '';
    ai.setGeminiFetch(null);
  }
});

test('demande d’un humain : l’équipe est prévenue', async () => {
  const state = { fields: { name: { value: 'Awa', confirmed: true }, phone: { value: '+228 90 00 00 01', confirmed: true } } };
  const r = await run('request_human', { reason: 'question sur le paiement' }, state);
  assert.equal(r.action.type, 'human');
  const { rows } = await pool.query(`SELECT body FROM notifications WHERE kind = 'callback'`);
  assert.match(rows[0].body, /Awa souhaite parler.+\+228 90 00 00 01.+paiement/);
});
