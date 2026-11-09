'use strict';
// Authentification de l'espace équipe : mots de passe scrypt, sessions en base (instances sans état),
// verrouillage après 5 échecs, cookie httpOnly + SameSite=Strict, en-tête anti-CSRF obligatoire.

const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { sha256, randomToken } = require('./tokens');
const { unauthorized, forbidden, bad } = require('./errors');

const COOKIE = 'ocd_admin';

const ROLES = {
  super_admin: 'Super administrateur',
  admin: 'Administrateur',
  booking_manager: 'Gestionnaire des réservations',
  assistant: 'Assistante',
  accounting: 'Comptabilité',
};

const PERMS = {
  super_admin: ['*'],
  admin: ['dashboard', 'notifications', 'bookings.read', 'bookings.write', 'payments.read', 'payments.write', 'packages.write',
    'resources.write', 'days.write', 'customers.read', 'audit.read', 'settings.write'],
  booking_manager: ['dashboard', 'notifications', 'bookings.read', 'bookings.write', 'days.write', 'customers.read'],
  assistant: ['dashboard', 'notifications', 'bookings.read'],
  accounting: ['dashboard', 'notifications', 'bookings.read', 'payments.read', 'payments.write', 'customers.read'],
};

const can = (role, perm) => (PERMS[role] || []).includes('*') || (PERMS[role] || []).includes(perm);

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, got);
}

function checkPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 10) throw bad('Le mot de passe doit contenir au moins 10 caractères.');
}

async function login(email, password, ip, userAgent) {
  const { rows } = await db.query('SELECT * FROM admin_users WHERE email = lower($1)', [String(email || '').trim()]);
  const u = rows[0];
  const fail = unauthorized('Email ou mot de passe incorrect.');
  if (!u || !u.active) { hashPassword('x'.repeat(10)); throw fail; } // temps constant approximatif
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw unauthorized('Compte temporairement bloqué après plusieurs essais. Réessayez dans 15 minutes.');
  if (!verifyPassword(String(password || ''), u.password_hash)) {
    await db.query(
      `UPDATE admin_users SET failed_logins = failed_logins + 1,
         locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE id = $1`, [u.id]
    );
    throw fail;
  }
  const token = randomToken();
  await db.query('UPDATE admin_users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [u.id]);
  await db.query(
    `INSERT INTO admin_sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5)`,
    [sha256(token), u.id, config.admin.sessionHours, ip || null, String(userAgent || '').slice(0, 200)]
  );
  return { token, user: publicUser(u) };
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, roleLabel: ROLES[u.role], resourceId: u.resource_id, perms: PERMS[u.role] };
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setSessionCookie(res, token) {
  const maxAge = config.admin.sessionHours * 3600;
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.isProd ? '; Secure' : ''}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0${config.isProd ? '; Secure' : ''}`);
}

// Middleware : session valide + (optionnel) permission + protection CSRF sur les écritures.
function requireAdmin(perm) {
  return async (req, res, next) => {
    try {
      const token = readCookie(req, COOKIE);
      if (!token) throw unauthorized();
      const { rows } = await db.query(
        `SELECT u.* FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [sha256(token)]
      );
      if (!rows[0]) throw unauthorized('Session expirée. Reconnectez-vous.');
      if (req.method !== 'GET' && req.get('x-ocd-admin') !== '1') throw forbidden('Requête refusée.');
      if (perm && !can(rows[0].role, perm)) throw forbidden();
      req.admin = rows[0];
      req.adminToken = token;
      next();
    } catch (err) { next(err); }
  };
}

async function logout(token) {
  if (token) await db.query('DELETE FROM admin_sessions WHERE token_hash = $1', [sha256(token)]);
}

async function createUser(client, { email, name, role, password, resourceId }) {
  if (!ROLES[role]) throw bad('Rôle invalide.');
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) throw bad('Email invalide.');
  if (!String(name || '').trim()) throw bad('Nom obligatoire.');
  checkPasswordStrength(password);
  const { rows } = await (client || db).query(
    `INSERT INTO admin_users (email, name, role, password_hash, resource_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [e, String(name).trim().slice(0, 80), role, hashPassword(password), resourceId || null]
  );
  return rows[0];
}

// Premier démarrage : crée le super administrateur à partir de ADMIN_EMAIL / ADMIN_PASSWORD.
async function bootstrapAdmin() {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM admin_users');
  if (rows[0].n > 0 || !config.admin.bootstrapEmail || !config.admin.bootstrapPassword) return null;
  return createUser(null, { email: config.admin.bootstrapEmail, name: config.admin.bootstrapName, role: 'super_admin', password: config.admin.bootstrapPassword });
}

module.exports = {
  COOKIE, ROLES, PERMS, can, hashPassword, verifyPassword, checkPasswordStrength, login, logout, publicUser,
  readCookie, setSessionCookie, clearSessionCookie, requireAdmin, createUser, bootstrapAdmin,
};
