'use strict';
// Tâches de fond : expiration des créneaux retenus, envoi des emails, nettoyage.
// Tout est en base : ça fonctionne même après un redémarrage, et plusieurs workers
// peuvent tourner en parallèle (FOR UPDATE SKIP LOCKED).

const db = require('../db');
const config = require('../config');
const log = require('../lib/log');
const { sendMail } = require('../lib/mailer');
const { loadForText, describe } = require('../lib/notify');
const { expireStale } = require('./booking');
const { fmtPrice } = require('../lib/time');
const { getSettings } = require('../lib/settings');

const MAX_ATTEMPTS = 5;

function customerEmail(b, kind) {
  const d = describe(b);
  const c = b.contact || {};
  const hello = `Bonjour ${c.name},`;
  const place = b.mode === 'presentiel'
    ? 'Rendez-vous au studio OCD de Lomé avec vos produits, un peu avant l’heure.'
    : 'Votre assistante OCD vous contactera sur WhatsApp avant le live pour tester votre connexion.';
  const recap = `Référence : ${b.ref}\nPackage : ${b.package_name}\nDate : ${d.when}\nMontant : ${fmtPrice(b.price)}`;
  const sign = '\n\nL’équipe OCD LIVE — Les opportunités, c’est dehors.';
  switch (kind) {
    case 'pending_payment':
      return { subject: `Votre réservation ${b.ref} est enregistrée`, text: `${hello}\n\nVotre live est réservé, en attente de paiement.\n\n${recap}\n\nSans paiement dans le délai indiqué, le créneau sera libéré.${sign}` };
    case 'confirmed':
    case 'quote_accepted':
      return { subject: `Votre live ${b.ref} est confirmé`, text: `${hello}\n\nVotre live OCD est confirmé. Il sera diffusé sur le compte House of Challenge.\n\n${recap}\n\n${place}${sign}` };
    case 'quote':
      return { subject: `Votre demande ${b.package_name} est bien reçue`, text: `${hello}\n\nNous avons bien reçu votre demande. L’équipe OCD vous contacte rapidement avec un devis. Le créneau est bloqué pour vous en attendant.\n\n${recap}${sign}` };
    case 'expired':
      return { subject: `Réservation ${b.ref} libérée`, text: `${hello}\n\nNous n’avons pas reçu votre paiement à temps : le créneau a été libéré. Vous pouvez réserver un nouvel horaire à tout moment.${sign}` };
    case 'cancelled':
      return { subject: `Réservation ${b.ref} annulée`, text: `${hello}\n\nVotre réservation a été annulée.\n\n${recap}${sign}` };
    case 'rescheduled':
      return { subject: `Votre live ${b.ref} a été déplacé`, text: `${hello}\n\nVotre live a été déplacé.\n\n${recap}\n\n${place}${sign}` };
    default:
      return null;
  }
}

async function runJob(c, job) {
  const p = job.payload;
  if (job.type === 'email.team') {
    const team = ((await getSettings()).contact || {}).teamEmails || [];
    if (!team.length) return 'skipped';
    const link = config.publicUrl ? `\n\nOuvrir l’espace équipe : ${config.publicUrl}/admin/` : '';
    const r = await sendMail({ to: team, subject: `[OCD LIVE] ${p.title}`, text: p.body + link });
    return r.sent ? 'done' : 'skipped';
  }
  if (job.type === 'email.customer') {
    const b = await loadForText(c, p.bookingId);
    if (!b || !b.contact || !b.contact.email) return 'skipped';
    const mail = customerEmail(b, p.kind);
    if (!mail) return 'skipped';
    const r = await sendMail({ to: b.contact.email, ...mail });
    return r.sent ? 'done' : 'skipped';
  }
  return 'skipped';
}

async function processJobs(limit = 20) {
  let handled = 0;
  for (let i = 0; i < limit; i++) {
    const did = await db.withTx(async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM jobs WHERE status = 'pending' AND run_after <= now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`
      );
      const job = rows[0];
      if (!job) return false;
      try {
        const status = await runJob(c, job);
        await c.query('UPDATE jobs SET status = $2, attempts = attempts + 1, updated_at = now() WHERE id = $1', [job.id, status]);
      } catch (err) {
        const attempts = job.attempts + 1;
        const final = attempts >= MAX_ATTEMPTS;
        await c.query(
          `UPDATE jobs SET status = $2, attempts = $3, last_error = $4,
             run_after = now() + make_interval(mins => $5), updated_at = now() WHERE id = $1`,
          [job.id, final ? 'failed' : 'pending', attempts, String(err.message).slice(0, 500), attempts * attempts]
        );
        log.warn('tâche en échec', { jobId: job.id, type: job.type, attempts, err: err.message });
      }
      return true;
    });
    if (!did) break;
    handled += 1;
  }
  return handled;
}

async function runOnce() {
  const expired = await db.withTx((c) => expireStale(c));
  const jobs = await processJobs();
  await db.query('DELETE FROM admin_sessions WHERE expires_at < now()');
  // Conversations IA : texte conservé 24 h maximum, aucun audio n'est jamais stocké.
  await db.query(`DELETE FROM ai_sessions WHERE updated_at < now() - interval '24 hours'`);
  if (expired || jobs) log.info('worker', { expired, jobs });
  return { expired, jobs };
}

let timer = null;
function start(intervalMs = config.workerIntervalMs) {
  const tick = async () => {
    try { await runOnce(); } catch (err) { log.error('worker en erreur', { err: err.message }); }
    timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, 1000);
}
function stop() { if (timer) clearTimeout(timer); timer = null; }

module.exports = { runOnce, processJobs, start, stop, customerEmail };
