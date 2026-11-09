# Architecture technique

## Vue d'ensemble

```
Navigateur (PWA)  ──HTTPS──▶  Cloudflare (CDN, protection)  ──▶  Railway : service web (Express)
                                                                     │
                                         Railway : worker ◀──────────┤
                                                                     ▼
                                                         PostgreSQL (source de vérité)
                                                         Redis (facultatif : limitation)
```

- **Service web** (`src/server.js`) : API JSON + pages statiques. Sans état.
- **Worker** (`src/worker.js`) : toutes les 15 s, expire les créneaux retenus et les paiements en retard, envoie les emails en file, nettoie les sessions.
- **PostgreSQL** : réservations, paiements, notifications, file de tâches, sessions, journal.
- Pas de microservices : un backend modulaire, deux processus.

## Base de données (`migrations/001_init.sql`)

| Table | Rôle |
| --- | --- |
| `resources` | Ressources réservables : studio de Lomé, assistantes. Indépendantes des clients. |
| `packages` | Formules (prix par mode, durée, nombre de lives, sur devis, promotions, actif). |
| `bookings` | Réservations : statut, ressource, intervalle `during`, contact, expiration, clé d'idempotence. |
| `customers` | Clients (unicité par téléphone). |
| `payments` | Paiements : prestataire, montant, statut, clé d'idempotence. |
| `webhook_events` | Événements de prestataire déjà traités (déduplication). |
| `notifications` | Notifications de l'espace équipe. |
| `jobs` | File de tâches (emails) traitée par le worker. |
| `blocked_days` | Jours fermés. |
| `admin_users`, `admin_sessions` | Comptes équipe (5 rôles) et sessions. |
| `audit_log` | Historique des modifications importantes. |
| `settings` | Horaires, marges, délais, marque (modifiables dans l'espace équipe). |

Statuts d'une réservation : `hold` (retenue quelques minutes) → `pending_payment` ou `quote` (sur devis) → `confirmed`. Sorties : `expired`, `cancelled`.

## Moteur de réservation : aucune double réservation

1. `bookings.during` = `[début, fin + marge de préparation)`.
2. Contrainte d'exclusion :
   ```sql
   EXCLUDE USING gist (resource_id WITH =, during WITH &&)
     WHERE (status IN ('hold','pending_payment','quote','confirmed'))
   ```
   PostgreSQL refuse **atomiquement** toute réservation active qui chevauche une autre sur la même ressource.
3. On ne fait jamais « SELECT puis INSERT ». On tente l'INSERT ; en cas de refus (`23P01`), on essaie la ressource suivante (assistante 2…), puis on renvoie un conflit avec les 3 prochains horaires libres.
4. Un verrou consultatif par ressource (`pg_advisory_xact_lock`, pris dans un ordre fixe) évite les interblocages entre insertions simultanées. Les transactions interrompues par PostgreSQL (`40P01`, `40001`) sont rejouées.
5. Une session à distance utilise une assistante, pas le studio : elle ne bloque pas le présentiel. Deux clients ne sont jamais affectés à la même assistante au même moment.
6. Expiration : `expires_at` en base. Avant chaque réservation, les retenues expirées de la zone sont libérées ; le worker libère les autres. Aucun minuteur en mémoire : tout survit à un redémarrage.
7. Idempotence : `Idempotency-Key` sur la création de retenue et sur le paiement ; un double clic renvoie la même réservation.

Parcours (CLAUDE.md, partie 3.3) : le client choisit → le serveur vérifie et **retient** (5 min) → le client complète ses informations (validées serveur) → récapitulatif → confirmation explicite → paiement → confirmation seulement à réception du paiement.

## Paiements (`src/services/payments/`)

- Interface `PaymentProvider` : `create`, `verifyWebhook`, `parseWebhook`.
- `manual` (production v1) : instructions Mobile Money ; l'équipe clique « Paiement reçu ».
- `demo` : simulation, passe par le même chemin signé qu'un vrai webhook. Refusé en production sans `ALLOW_DEMO_PAYMENTS=true`.
- Un seul paiement ouvert et un seul paiement réussi par réservation (index uniques partiels). Webhooks dédupliqués par `event_id`, signature vérifiée, montant contrôlé. La redirection du navigateur n'est jamais une preuve de paiement.
- Paiement reçu après expiration : on récupère le créneau s'il est libre, sinon l'équipe est alertée (`late_payment`).
- Ajouter FedaPay / CinetPay / PayGate = un nouveau fichier fournisseur, sans toucher au moteur.

## Notifications

Créées dans la même transaction que l'événement (réservation, paiement, expiration, annulation, report). Exemple :

> Mireille Ndongo (Boutique Élégance, mode, vêtements et chaussures) a réservé le mardi 1er décembre de 9h00 à 13h00, heure de Lomé. Sera à distance depuis Douala (Cameroun). Assistante 1 l'accompagne. Va présenter : chaussures pour femmes. Package Remote Business · 35 000 FCFA.

Les emails (équipe et client) partent de la table `jobs`, traitée par le worker, avec nouvelles tentatives.

## Sécurité

- Requêtes SQL paramétrées partout ; validation serveur de toutes les saisies.
- Client : jeton de réservation = HMAC(`APP_SECRET`, id) dans l'en-tête `X-Booking-Token`.
- Équipe : mots de passe scrypt, sessions en base (cookie `HttpOnly`, `SameSite=Strict`, `Secure`), en-tête anti-CSRF obligatoire, verrouillage après 5 échecs, permissions par rôle, journal d'activité.
- En-têtes : CSP stricte (aucun script inline), HSTS, `frame-ancestors 'none'` (helmet).
- Limitation des requêtes (Redis ou mémoire).
- API : `Cache-Control: no-store` partout ; jamais de cache public sur les disponibilités, réservations, paiements ou sessions.

## Interface

- PWA sans framework ni étape de compilation : légère sur les Android modestes.
- Fichiers versionnés `?v=<commit>` : cache CDN long et sûr. Le service worker ne met jamais en cache `/api` ni `/admin`.
- Heure de Lomé (GMT) comme référence ; heure locale du client affichée si différente.
- Marque centralisée : réglage `brand` (nom, slogan, compte de diffusion, logo) et variables CSS dans `public/styles.css`. Le wordmark « OCD LIVE » est provisoire, à remplacer par le logo officiel (`brand.logoUrl`, `public/icons/`).

## Tests (`npm test`)

Sur un vrai PostgreSQL : 100 demandes simultanées sur le même créneau (1 réussite, 99 conflits), 100 demandes à distance (2 réussites = 2 assistantes), créneaux distincts en parallèle, marge de préparation, idempotence, 100 expirations simultanées avec 2 workers, parcours complet, double paiement, webhook dupliqué ou mal signé, paiement en retard, sur devis, report et affectation protégés, 100 requêtes HTTP simultanées, rôles, CSRF, verrouillage de compte.
