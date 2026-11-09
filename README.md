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

| Document | Pour qui | Contenu |
| --- | --- | --- |
| [docs/GUIDE-UTILISATION.md](docs/GUIDE-UTILISATION.md) | Équipe OCD | Parcours client, réceptionniste IA, packages, espace équipe |
| [CLAUDE.md](CLAUDE.md) | Tous | Cahier des charges complet, règles qui priment sur tout |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Développeurs | Base de données, moteur de réservation, paiements, IA, sécurité |
| [docs/DEPLOIEMENT-RAILWAY.md](docs/DEPLOIEMENT-RAILWAY.md) | Mainteneurs | Déploiement par Git, variables (deux suffisent) |
| [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) | Mainteneurs | DNS, cache, protection |
| [docs/SAUVEGARDE-RESTAURATION.md](docs/SAUVEGARDE-RESTAURATION.md) | Mainteneurs | Sauvegardes et test de restauration |
| [docs/FEUILLE-DE-ROUTE.md](docs/FEUILLE-DE-ROUTE.md) | Contributeurs | Chantiers ouverts et sujets pour débuter |

## Contribuer

Les contributions sont les bienvenues : corrections, améliorations, traductions, tests. Commencez par [CONTRIBUTING.md](CONTRIBUTING.md), puis choisissez un chantier dans la [feuille de route](docs/FEUILLE-DE-ROUTE.md) ou ouvrez une issue.

- Charte de conduite : [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Faille de sécurité : [SECURITY.md](SECURITY.md), jamais en issue publique
- Chaque pull request est relue par un mainteneur ; une fusion sur `main` déploie la production.

## Intégration continue

`.github/workflows/ci.yml` lance `npm run check` (syntaxe) et `npm test` sur PostgreSQL 16 à chaque push et pull request.
