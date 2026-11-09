'use strict';
// Crée un compte de l'espace équipe.
// Usage : npm run create-admin -- <email> "<Nom>" [role]
// Rôles : super_admin, admin, booking_manager, assistant, accounting
// Mot de passe : variable NEW_ADMIN_PASSWORD, sinon un mot de passe aléatoire est généré et affiché une seule fois.

const crypto = require('node:crypto');
const db = require('../db');
const { createUser, ROLES } = require('../lib/auth');

async function main() {
  const [email, name, role = 'admin'] = process.argv.slice(2);
  if (!email || !name || !ROLES[role]) {
    console.error('Usage : npm run create-admin -- <email> "<Nom>" [' + Object.keys(ROLES).join('|') + ']');
    process.exit(1);
  }
  const password = process.env.NEW_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const u = await createUser(null, { email, name, role, password });
  console.log(`Compte créé : ${u.email} (${ROLES[u.role]})`);
  if (!process.env.NEW_ADMIN_PASSWORD) console.log(`Mot de passe provisoire : ${password}`);
  await db.close();
}

main().catch(async (err) => { console.error(err.message); await db.close(); process.exit(1); });
