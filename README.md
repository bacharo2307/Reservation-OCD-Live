# OCD LIVE

Application de réservation des lives commerciaux OCD (Opportunité C'est Dehors) : PWA mobile, réceptionniste IA, espace équipe. Hébergée sur Railway, déployée par `git push` sur `main`.

- **Client** (`/`) : live en présentiel au studio de Lomé ou à distance → package → date → heure → informations → récapitulatif → paiement Mobile Money. Aucun compte à créer.
- **Réceptionniste IA** : le client réserve en parlant (ou en écrivant). Elle fait confirmer chaque information, vérifie les créneaux réels, lit un récapitulatif et ne confirme qu'après un « oui » explicite. Le serveur impose ces règles.
- **Équipe** (`/admin/`) : tableau de bord, notifications, réservations (confirmer un paiement, annuler, reporter, changer d'assistante), packages, assistantes, jours bloqués, clients, paiements, journal, utilisateurs, réglages.
- **Garantie** : aucune double réservation. PostgreSQL refuse tout chevauchement sur une même ressource (contrainte d'exclusion `tstzrange` + GiST), testé avec 100 requêtes simultanées.

## Démarrage local

Prérequis : Node.js 20+ et PostgreSQL 14+.

```bash
npm install
cp .env.example .env        # DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD ; ANTHROPIC_API_KEY pour l'IA
npm run migrate
npm run seed:demo           # facultatif, en local : 8 réservations d'exemple
npm run dev                 # http://localhost:3000  et  http://localhost:3000/admin/
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm start` | Service web (API, pages, worker intégré). Applique les migrations au démarrage. |
| `npm run worker` | Worker séparé (facultatif, pour la montée en charge). |
| `npm run migrate` | Applique les migrations SQL de `migrations/`. |
| `npm test` | Tests sur un vrai PostgreSQL (embarqué en local, service Postgres en CI). |
| `npm run create-admin -- <email> "<Nom>" [rôle]` | Crée un compte équipe. |
| `npm run seed:demo` / `npm run demo:reset` | Ajoute / supprime des données d'exemple (poste local). |

## Structure

```
migrations/          schéma SQL (source de vérité) et données de référence
src/server.js        service web             src/worker.js   worker séparé (facultatif)
src/app.js           Express : sécurité, cache, routes, pages
src/routes/          API publique, réceptionniste IA (ai.js), espace équipe (admin.js)
src/services/        moteur de réservation, disponibilités, paiements, IA, actions équipe, tâches
src/lib/             réglages, validation, authentification, notifications, emails, secret
public/              PWA (index.html, app.js, voice.js), espace équipe (admin/), styles, service worker
public/brand/        logo officiel : déposer logo.svg ou logo.png, il s'affiche partout
tests/               concurrence, paiements, HTTP, sécurité, réceptionniste IA
docs/                architecture, déploiement Railway, Cloudflare, sauvegardes
```

## Documentation

- [docs/DEPLOIEMENT-RAILWAY.md](docs/DEPLOIEMENT-RAILWAY.md) — déploiement par Git et variables (deux suffisent)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — base de données, moteur de réservation, paiements, IA, sécurité
- [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) — DNS, cache, protection
- [docs/SAUVEGARDE-RESTAURATION.md](docs/SAUVEGARDE-RESTAURATION.md) — sauvegardes et test de restauration

## Intégration continue

`.github/workflows/ci.yml` lance la vérification de syntaxe et les tests sur PostgreSQL 16 à chaque push et pull request.

## Prochaines étapes

Paiement en ligne automatique (FedaPay, CinetPay ou PayGate, via l'interface `PaymentProvider`), voix plus naturelle (fournisseur vocal dédié via `OCDVoice`), notifications WhatsApp, authentification à deux facteurs pour l'équipe.
