'use strict';
// Envoi d'emails : API Resend (HTTPS) si RESEND_API_KEY, sinon SMTP si SMTP_HOST, sinon ignoré (journalisé).

const config = require('../config');

let transport = null;
function smtp() {
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: config.mail.smtpHost,
      port: config.mail.smtpPort,
      secure: config.mail.smtpSecure,
      auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPass } : undefined,
    });
  }
  return transport;
}

const enabled = () => Boolean(config.mail.resendApiKey || config.mail.smtpHost);

async function sendMail({ to, subject, text }) {
  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) return { skipped: 'aucun destinataire' };
  if (config.mail.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, to: recipients, subject, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { sent: true };
  }
  if (config.mail.smtpHost) {
    await smtp().sendMail({ from: config.mail.from, to: recipients.join(', '), subject, text });
    return { sent: true };
  }
  return { skipped: 'email non configuré' };
}

module.exports = { sendMail, enabled };
