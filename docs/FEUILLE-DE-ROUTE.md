# Feuille de route

Les chantiers ouverts du projet, pour savoir où contribuer. Avant de commencer, ouvrez ou commentez l'issue correspondante pour éviter le travail en double. Les sujets marqués **premier sujet** conviennent pour une première contribution.

## Priorités

| Chantier | Ce qu'il faut faire | Fichiers principaux |
| --- | --- | --- |
| Paiement en ligne automatique | Ajouter un prestataire Mobile Money (FedaPay, CinetPay ou PayGate) derrière l'interface `PaymentProvider` : création du paiement, redirection, webhook signé, tests. Le choix du prestataire revient à OCD. | `src/services/payments/` |
| Logo officiel | Intégrer le logo OCD LIVE fourni par OCD et regénérer les icônes d'installation. **Premier sujet** dès que le fichier est disponible. | `public/brand/`, `public/icons/` |
| Notifications WhatsApp | Envoyer les notifications équipe et client par l'API WhatsApp Business officielle, en plus des emails, sans bloquer la réservation si WhatsApp échoue. | `src/services/jobs.js`, `src/lib/notify.js` |
| Voix plus naturelle | Proposer un fournisseur vocal dédié (OpenAI Realtime, ElevenLabs…) avec le même contrat que `OCDVoice`, clés gardées côté serveur, jetons temporaires. | `public/voice.js`, `src/routes/ai.js` |
| Double authentification de l'équipe | Code TOTP (application d'authentification) à la connexion de l'espace équipe. | `src/lib/auth.js`, `public/admin/` |

## Améliorations

| Chantier | Ce qu'il faut faire | Fichiers principaux |
| --- | --- | --- |
| Vue calendrier dans l'espace équipe | Planning visuel par jour et par semaine, en plus de la liste des réservations. | `public/admin/admin.js`, `src/routes/admin.js` |
| Export des réservations | Export CSV filtré (dates, statut) pour la comptabilité. **Premier sujet.** | `src/routes/admin.js` |
| Tests de bout en bout | Parcours client et équipe automatisés dans un navigateur (Playwright ou Puppeteer), exécutés en CI. | `tests/` |
| Accessibilité | Audit lecteur d'écran et clavier du parcours de réservation et de la réceptionniste. **Premier sujet.** | `public/` |
| Version anglaise | Traduire l'interface client pour les commerçants anglophones (Ghana, Nigeria). | `public/app.js` |
| Cloudflare | Mettre en place DNS, cache et protection selon `docs/CLOUDFLARE.md`. | configuration |
| Sauvegardes automatiques | Tâche planifiée d'export PostgreSQL vers un stockage externe, avec test de restauration. | `docs/SAUVEGARDE-RESTAURATION.md` |

## Déjà livré

- Parcours de réservation en 7 étapes, sans compte, avec retenue du créneau et propositions en cas de conflit.
- Moteur sans double réservation (contrainte d'exclusion PostgreSQL), testé avec 100 requêtes simultanées.
- Paiement Mobile Money confirmé par l'équipe, paiements idempotents, webhooks signés.
- Espace équipe : notifications, réservations, packages, assistantes, jours bloqués, clients, paiements, journal, utilisateurs et rôles, réglages.
- Réceptionniste IA à la voix ou à l'écrit, avec confirmation de chaque information et récapitulatif obligatoire.
- Design « verre » en mode clair et sombre, installable comme une application (PWA).
