'use strict';
// Jeton client d'une réservation : HMAC(APP_SECRET, id). Rien à stocker, impossible à deviner.

const crypto = require('node:crypto');
const config = require('../config');

function bookingToken(id) {
  return crypto.createHmac('sha256', config.appSecret).update('booking:' + id).digest('base64url');
}

function checkBookingToken(id, token) {
  if (typeof token !== 'string' || token.length < 20) return false;
  const a = Buffer.from(bookingToken(id));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

module.exports = { bookingToken, checkBookingToken, sha256, randomToken };
