'use strict';
// Abstraction PaymentProvider : changer de prestataire sans toucher au moteur de réservation.
//
// Un prestataire expose :
//   name                     identifiant (manual, demo, fedapay…)
//   create({ booking, method, payment })  -> { providerRef, status, instructions?, redirectUrl? }
//   verifyWebhook(rawBody, headers)        -> true/false (signature du prestataire)
//   parseWebhook(rawBody)                  -> { eventId, type: 'succeeded'|'failed', providerRef, amount }
//
// « manual » : le client paie par Mobile Money au numéro OCD (réglé dans l'espace équipe),
//              l'équipe confirme à réception.
// « demo »   : paiement simulé, réservé au développement et aux tests (jamais en production).

const crypto = require('node:crypto');
const config = require('../../config');
const { getSettings } = require('../../lib/settings');
const { fmtPrice } = require('../../lib/time');

const rand = () => crypto.randomBytes(6).toString('hex');

const manual = {
  name: 'manual',
  live: true,
  async create({ booking }) {
    const pay = (await getSettings()).payment || {};
    const steps = pay.mobileMoneyNumber
      ? [
        `Envoyez ${fmtPrice(booking.price)} par Mobile Money au ${pay.mobileMoneyNumber} (${pay.mobileMoneyName || 'OCD'}).`,
        `Indiquez la référence ${booking.ref} dans le motif du transfert.`,
        'L’équipe OCD confirme votre réservation dès réception du paiement.',
      ]
      : [
        `Montant à régler : ${fmtPrice(booking.price)} (référence ${booking.ref}).`,
        'L’équipe OCD vous contacte sur WhatsApp pour le paiement Mobile Money.',
        'Votre réservation est confirmée dès réception du paiement.',
      ];
    return { providerRef: `MAN-${booking.ref}-${rand()}`, status: 'pending', instructions: { kind: 'manual', steps } };
  },
  verifyWebhook() { return false; }, // pas de webhook : confirmation par l'équipe
  parseWebhook() { throw new Error('manual: pas de webhook'); },
};

function sign(body) {
  return crypto.createHmac('sha256', config.appSecret).update(body).digest('hex');
}

const demo = {
  name: 'demo',
  live: false,
  async create() {
    return { providerRef: `DEMO-${rand()}`, status: 'pending', instructions: { kind: 'demo', steps: ['Mode démonstration : aucun argent n’est prélevé.'] } };
  },
  sign,
  verifyWebhook(rawBody, headers) {
    const got = String(headers['x-demo-signature'] || '');
    const want = sign(rawBody);
    return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
  },
  parseWebhook(rawBody) {
    const e = JSON.parse(rawBody.toString('utf8'));
    return { eventId: String(e.id), type: e.type === 'payment.succeeded' ? 'succeeded' : 'failed', providerRef: String(e.providerRef), amount: e.amount };
  },
};

const registry = { manual, demo };

function current() {
  const p = registry[config.payments.provider];
  if (!p) throw new Error(`Prestataire de paiement inconnu : ${config.payments.provider}`);
  return p;
}

module.exports = { current, get: (name) => registry[name], registry };
