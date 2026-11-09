# OCD LIVE

Application de réservation des lives commerciaux OCD (Opportunité C'est Dehors) : PWA mobile, API, worker et espace équipe. Hébergée sur Railway, déployée depuis GitHub.

- **Client** (`/`) : live en présentiel au studio de Lomé ou à distance → package → date → heure → informations → récapitulatif → paiement. Aucun compte à créer.
- **Équipe** (`/admin/`) : tableau de bord, notifications, réservations (confirmer, annuler, reporter, changer d'assistante), packages, assistantes, jours bloqués, clients, paiements, journal, utilisateurs, réglages.
- **Garantie** : aucune double réservation. PostgreSQL refuse tout chevauchement sur une même ressource (contrainte d'exclusion `tstzrange` + GiST), testé avec 100 requêtes simultanées.

## Démarrage local

Prérequis : Node.js 20+ et PostgreSQL 14+.

```bash
npm install
cp .env.example .env        # puis renseigner DATABASE_URL, APP_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
                            # en local : NODE_ENV=development et PAYMENT_PROVIDER=demo
npm run migrate
npm run seed:demo           # facultatif : 8 réservations d'exemple
npm run dev                 # http://localhost:3000  et  http://localhost:3000/admin/
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm start` | Service web (API + pages). Applique les migrations au démarrage. |
| `npm run worker` | Worker : expiration des créneaux retenus, emails, nettoyage. |
| `npm run migrate` | Applique les migrations SQL de `migrations/`. |
| `npm test` | Tests sur un vrai PostgreSQL (embarqué en local, service Postgres en CI). |
| `npm run create-admin -- <email> "<Nom>" [rôle]` | Crée un compte équipe. |
| `npm run seed:demo` / `npm run demo:reset` | Ajoute / supprime les données de démonstration. |

## Structure

```
migrations/         schéma SQL (source de vérité) et données de référence
src/server.js       service web          src/worker.js   worker
src/app.js          Express : sécurité, cache, routes, pages
src/routes/         API publique (public.js) et espace équipe (admin.js)
src/services/       moteur de réservation, disponibilités, paiements, actions équipe, tâches
src/lib/            réglages, validation, authentification, notifications, emails, limitation
public/             PWA client (index.html, app.js), espace équipe (admin/), styles, service worker
tests/              tests de concurrence, paiements, HTTP et sécurité
docs/               architecture, déploiement Railway, Cloudflare, sauvegardes
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — schéma de base, moteur de réservation, paiements, sécurité
- [docs/DEPLOIEMENT-RAILWAY.md](docs/DEPLOIEMENT-RAILWAY.md) — mise en ligne pas à pas et variables d'environnement
- [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) — DNS, cache, protection
- [docs/SAUVEGARDE-RESTAURATION.md](docs/SAUVEGARDE-RESTAURATION.md) — sauvegardes et test de restauration

## Intégration continue

Chaque push sur `main` et chaque pull request lance `.github/workflows/ci.yml` : vérification de syntaxe puis tests sur PostgreSQL 16. Railway déploie `main` uniquement si la CI passe (option « Wait for CI » du service).

## Ce qui viendra après la v1

Paiement en ligne automatique (FedaPay, CinetPay ou PayGate, via l'interface `PaymentProvider`), réceptionniste IA vocale (`VoiceProvider`), notifications WhatsApp, authentification à deux facteurs pour l'équipe.
