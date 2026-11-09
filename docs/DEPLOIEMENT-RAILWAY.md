# Déploiement sur Railway

Le code part de GitHub (`bacharo2307/Reservation-OCD-Live`, branche `main`). La CI GitHub teste chaque push, puis Railway déploie automatiquement.

## 1. Créer le projet

1. Railway → **New Project** → **Deploy from GitHub repo** → choisir `Reservation-OCD-Live`.
2. Dans le projet : **+ New** → **Database** → **PostgreSQL**.
3. (Facultatif) **+ New** → **Database** → **Redis**, pour une limitation des requêtes partagée entre instances.

## 2. Service web (créé à l'étape 1)

`railway.json` fixe déjà : démarrage `npm start`, migrations en pré-déploiement (`npm run migrate`), contrôle de santé `/api/health`, redémarrage automatique.

**Settings**
- *Source* → Branch `main`, cocher **Wait for CI** (déploie seulement si les tests passent).
- *Networking* → **Generate Domain** (ou domaine personnalisé, voir CLOUDFLARE.md).

**Variables** (onglet Variables) :

| Variable | Valeur |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `APP_SECRET` | chaîne aléatoire de 48 caractères (garder secrète) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | premier super administrateur (créé au premier démarrage) |
| `PUBLIC_URL` | `https://<votre domaine>` |
| `PAYMENT_PROVIDER` | `manual` (Mobile Money confirmé par l'équipe) |
| `PAYMENT_MANUAL_NUMBER`, `PAYMENT_MANUAL_NAME` | numéro Mobile Money OCD affiché aux clients |
| `TEAM_EMAILS` | adresses qui reçoivent les notifications, séparées par des virgules |
| `RESEND_API_KEY`, `MAIL_FROM` | envoi des emails (Resend passe par HTTPS) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` si Redis est ajouté |
| `TRUST_PROXY` | `1` (ou `2` derrière Cloudflare) |

Pour une démonstration avant lancement : `PAYMENT_PROVIDER=demo` et `ALLOW_DEMO_PAYMENTS=true` (un bandeau « Mode démonstration » s'affiche). Repasser à `manual` avant d'ouvrir au public.

Toutes les variables sont décrites dans `.env.example`.

## 3. Service worker

1. **+ New** → **GitHub Repo** → le même dépôt.
2. *Settings* → *Config-as-code* → chemin `railway.worker.json` (démarrage `npm run worker`).
3. Variables : `NODE_ENV`, `DATABASE_URL`, `APP_SECRET` (identique au web), `PUBLIC_URL`, `TEAM_EMAILS`, `RESEND_API_KEY`, `MAIL_FROM`, `MIGRATE_ON_BOOT=false`.

Petite installation : on peut se passer de ce service avec `RUN_WORKER_IN_WEB=true` sur le service web.

## 4. Vérifications après déploiement

- `https://<domaine>/api/health` répond `{"status":"ok","db":"ok"}`.
- `https://<domaine>/admin/` : connexion avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`, puis **changer ce mot de passe** (Utilisateurs) et créer les comptes de l'équipe.
- Faire une réservation test, vérifier la notification dans l'espace équipe et l'email.
- Logs : JSON structurés, une ligne par requête (`msg: "http"`) et par événement (créneau retenu, conflit, paiement).

## 5. Montée en charge

- Les services sont sans état (sessions, verrous, tâches dans PostgreSQL) : augmenter le nombre de **Replicas** du service web suffit.
- Garder `DB_POOL_MAX × replicas` sous la limite de connexions de PostgreSQL (100 par défaut).
- Surveiller CPU et RAM dans *Metrics* ; le worker peut tourner en plusieurs exemplaires sans doublon (`FOR UPDATE SKIP LOCKED`).

## 6. Données de démonstration

- Ajouter : variable `DEMO_SEED=true` sur le service web. Au démarrage, 8 réservations d'exemple sont créées si elles n'existent pas déjà.
- **Avant l'ouverture au public** : retirer `DEMO_SEED`, puis lancer `npm run demo:reset` dans le conteneur (`railway ssh -s web -- npm run demo:reset`, après `railway ssh keys add`). Repasser aussi `PAYMENT_PROVIDER=manual` et supprimer `ALLOW_DEMO_PAYMENTS`.

## 7. Intégration continue et « Wait for CI »

Activer **Wait for CI** seulement quand GitHub Actions fonctionne sur le compte. Tant que la CI ne peut pas démarrer (par exemple un compte GitHub bloqué pour facturation), cette option empêcherait tout déploiement.
