'use strict';

class AppError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

const bad = (message, extra) => new AppError(400, 'invalid', message, extra);
const notFound = (message = 'Introuvable.') => new AppError(404, 'not_found', message);
const conflict = (code, message, extra) => new AppError(409, code, message, extra);
const gone = (code, message) => new AppError(410, code, message);
const forbidden = (message = 'Accès refusé.') => new AppError(403, 'forbidden', message);
const unauthorized = (message = 'Connexion requise.') => new AppError(401, 'unauthorized', message);

// Codes PostgreSQL utiles
const PG = {
  EXCLUSION: '23P01', // chevauchement refusé par la contrainte d'exclusion
  UNIQUE: '23505',
};

module.exports = { AppError, bad, notFound, conflict, gone, forbidden, unauthorized, PG };
