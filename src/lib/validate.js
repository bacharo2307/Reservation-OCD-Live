'use strict';
// Validation serveur des informations saisies par le client.

const COUNTRIES = [
  ['Togo', 'Africa/Lome'], ['Bénin', 'Africa/Porto-Novo'], ["Côte d'Ivoire", 'Africa/Abidjan'], ['Ghana', 'Africa/Accra'],
  ['Burkina Faso', 'Africa/Ouagadougou'], ['Sénégal', 'Africa/Dakar'], ['Mali', 'Africa/Bamako'], ['Niger', 'Africa/Niamey'],
  ['Guinée', 'Africa/Conakry'], ['Nigeria', 'Africa/Lagos'], ['Cameroun', 'Africa/Douala'], ['Gabon', 'Africa/Libreville'],
  ['Congo', 'Africa/Brazzaville'], ['RD Congo', 'Africa/Kinshasa'], ['France', 'Europe/Paris'], ['Belgique', 'Europe/Brussels'],
  ['Allemagne', 'Europe/Berlin'], ['Suisse', 'Europe/Zurich'], ['Canada', 'America/Toronto'], ['États-Unis', 'America/New_York'],
  ['Autre pays', null],
];

const SECTORS = [
  'Alimentation et restauration', 'Mode, vêtements et chaussures', 'Beauté et cosmétiques', 'Téléphones et électronique',
  'Maison et décoration', 'Agriculture et produits locaux', 'Santé et bien-être', 'Services', 'Formation et coaching', 'Autre',
];

const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function validateContact(input) {
  const i = input || {};
  const c = {
    name: clean(i.name, 80),
    company: clean(i.company, 100),
    sector: clean(i.sector, 60),
    products: clean(i.products, 240),
    country: clean(i.country, 40),
    city: clean(i.city, 60),
    phone: clean(i.phone, 25),
    email: clean(i.email, 120).toLowerCase(),
  };
  const errors = {};
  if (c.name.length < 2) errors.name = 'Indiquez votre nom et prénom.';
  if (c.company.length < 2) errors.company = 'Indiquez le nom de votre entreprise ou boutique.';
  if (!SECTORS.includes(c.sector)) errors.sector = 'Choisissez votre business.';
  if (c.products.length < 3) errors.products = 'Dites-nous ce que vous allez vendre ou présenter.';
  if (!COUNTRIES.some(([n]) => n === c.country)) errors.country = 'Choisissez votre pays.';
  if (c.city.length < 2) errors.city = 'Indiquez votre ville.';
  const digits = c.phone.replace(/\D/g, '');
  if (!/^\+?[\d\s().-]+$/.test(c.phone) || digits.length < 8 || digits.length > 15) errors.phone = 'Numéro WhatsApp invalide.';
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) errors.email = 'Adresse email invalide.';
  return { value: c, errors, ok: Object.keys(errors).length === 0 };
}

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const isIdemKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(s);

module.exports = { validateContact, COUNTRIES, SECTORS, clean, isUuid, isIdemKey };
