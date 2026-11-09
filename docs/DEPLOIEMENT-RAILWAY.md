# Déploiement sur Railway

Le déploiement passe uniquement par Git : un `git push` sur la branche `main` du dépôt GitHub `bacharo2307/Reservation-OCD-Live` déclenche le déploiement Railway. Aucune commande Railway n'est nécessaire.

## Variables (onglet Variables du service web)

| Variable | Valeur | Obligatoire |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | oui |
| `ANTHROPIC_API_KEY` | clé de l'API Claude | pour la réceptionniste IA |
| `RESEND_API_KEY` | clé Resend | pour envoyer les emails |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | premier compte de l'espace équipe | seulement au tout premier démarrage |

Tout le reste est automatique :
- le secret de signature est généré au premier démarrage et gardé en base ;
- l'adresse publique vient de Railway (`RAILWAY_PUBLIC_DOMAIN`) ;
- le worker (expirations, emails) tourne dans le service web ;
- les paiements sont en mode Mobile Money confirmé par l'équipe (le mode démo n'existe plus en production) ;
- numéro Mobile Money, WhatsApp et emails de l'équipe : **espace équipe → Réglages**.

Variables devenues inutiles, à supprimer du service web si elles existent : `NODE_ENV`, `APP_SECRET`*, `ADMIN_NAME`, `PAYMENT_PROVIDER`, `ALLOW_DEMO_PAYMENTS`, `DEMO_SEED`, `RUN_WORKER_IN_WEB`, `TRUST_PROXY`, `PUBLIC_URL`, et `ADMIN_EMAIL` / `ADMIN_PASSWORD` une fois le compte créé.

\* Supprimer `APP_SECRET` déconnecte les réservations en cours dans les navigateurs (le nouveau secret est généré en base) : à faire de préférence en dehors des heures d'activité.

## Déploiement automatique depuis GitHub

Dans le service web → *Settings* → *Source* :
1. le dépôt `bacharo2307/Reservation-OCD-Live` doit être **connecté via l'application GitHub de Railway** (bouton « Connect Repo »), branche `main` ;
2. laisser **Wait for CI** désactivé tant que GitHub Actions ne peut pas démarrer sur le compte (un compte GitHub bloqué pour facturation empêche la CI de tourner, et Railway ne déploierait plus).

`railway.json` fixe le reste : migrations avant chaque déploiement, démarrage `npm start`, contrôle de santé `/api/health`, redémarrage automatique.

## Vérifications après un déploiement

- `https://<domaine>/api/health` répond `{"status":"ok","db":"ok"}` avec la version du commit.
- `https://<domaine>/admin/` : connexion, puis **Réglages** (numéro Mobile Money, WhatsApp, emails).
- Une réservation test : notification dans l'espace équipe, email si Resend est configuré.

## Montée en charge

- Services sans état : augmenter les **Replicas** du service web suffit.
- Pour séparer le worker : nouveau service depuis le même dépôt, config `railway.worker.json`, mêmes variables, et `RUN_WORKER_IN_WEB=false` sur le service web.
- Garder `DB_POOL_MAX × replicas` sous la limite de connexions PostgreSQL (100 par défaut).
