PROJET OCD LIVE — APPLICATION PWA PREMIUM, RÉSERVATION INTELLIGENTE ET RÉCEPTIONNISTE IA VOCAL

MISSION GÉNÉRALE

Tu dois concevoir et développer OCD LIVE, une application mobile PWA professionnelle destinée à organiser et gérer les réservations de sessions de vente en direct de la communauté OCD (Opportunité C'est Dehors), portée par Bovann.

Il ne s'agit pas de créer un simple site vitrine ou une page web avec quelques formulaires.

Il faut construire une véritable application de réservation commerciale, mobile-first, installable sur Android et iOS, avec une interface haut de gamme, un moteur de réservation fiable, un espace d'administration complet et un réceptionniste IA vocal facultatif.

L'application sera hébergée sur RAILWAY.

L'infrastructure devra être pensée dès le départ pour supporter une augmentation du nombre de visiteurs et de réservations sans saturation inutile du serveur.

La priorité absolue est la fiabilité des réservations, notamment lorsque plusieurs personnes essaient de réserver le même créneau au même moment.

---

PARTIE 1 — IDENTITÉ ET DIRECTION ARTISTIQUE

1.1 Identité officielle

Nom du produit : OCD LIVE.

Organisation : OCD — Opportunité C'est Dehors.

Personnalité de la marque :

- Africaine.
- Moderne.
- Ambitieuse.
- Commerciale.
- Accessible.
- Professionnelle.
- Dynamique.

Slogan de référence :
« Les opportunités, c'est dehors. »

Rechercher les éléments graphiques officiels disponibles sur les supports publics de Bovann, OCD et Bovann Group.

Priorité :

1. Logo officiel OCD.
2. Logo officiel OCD Live, s'il existe.
3. Identité graphique de Bovann Group.
4. Photographies officielles autorisées.

IMPORTANT :
Ne jamais inventer un logo et le présenter comme le logo officiel.

Si aucun fichier officiel n'est disponible dans le dépôt, créer provisoirement un wordmark typographique « OCD LIVE », facilement remplaçable par le véritable logo.

Ne pas utiliser arbitrairement le portrait de Bovann, ses photographies ou ses éléments de marque comme éléments décoratifs.

Prévoir un système centralisé de gestion des ressources graphiques afin de remplacer facilement les logos, couleurs, images et slogans.

1.2 Design Glassmorphism

L'application doit adopter une direction artistique Glassmorphism premium.

Créer une interface avec :

- Cartes translucides.
- Surfaces en verre.
- Backdrop blur.
- Bordures lumineuses très fines.
- Transparences élégantes.
- Dégradés subtils.
- Ombres douces.
- Profondeur visuelle.
- Transitions fluides.
- Micro-interactions.
- Icônes cohérentes.
- Typographie moderne.

Le résultat doit être comparable à une application SaaS premium contemporaine.

Ne pas transformer l'application en démonstration excessive d'effets graphiques.

La lisibilité doit toujours être prioritaire.

Prévoir un mode clair et un mode sombre.

L'expérience mobile doit être particulièrement soignée.

Éviter les longues pages, les menus complexes et les formulaires interminables.

---

PARTIE 2 — APPLICATION CLIENT

2.1 Accueil

L'accueil doit être immédiatement compréhensible.

Titre :
« Votre business mérite d'être vu. »

Description :
« Présentez vos produits et services à travers les Lives commerciaux OCD. »

Afficher deux grandes options :

A. LIVE EN PRÉSENTIEL
Le client vient au studio OCD à Lomé avec ses produits.

B. LIVE À DISTANCE
Le client participe depuis sa boutique, son domicile ou son entreprise, depuis n'importe quel pays.

Afficher également une option discrète :

« Parler à notre réceptionniste IA ».

L'utilisateur ne doit jamais être obligé de créer un compte pour commencer sa réservation.

2.2 Réservation guidée

Construire un parcours simple avec les étapes suivantes :

1. Mode de participation.
2. Choix du package.
3. Choix de la date.
4. Choix de l'heure.
5. Informations commerciales.
6. Récapitulatif.
7. Paiement et confirmation.

L'ordre peut être amélioré si cela facilite l'expérience utilisateur, mais aucune réservation ne doit être possible sans validation des informations essentielles.

2.3 Packages

Créer six packages administrables :

- Découverte : 1h30, présentiel, 20 000 FCFA.
- Business Plus : 4h, présentiel, 45 000 FCFA.
- Remote Starter : 1h30, distance, 15 000 FCFA.
- Remote Business : 4h, distance, 35 000 FCFA.
- Visibility Premium : présentiel ou distance, sur devis. Bovann publie la vidéo de présentation du client sur son compte, annonce le live, puis le client passe 1h30 en live.
- Pack Mensuel : présentiel ou distance, 4 lives de 1h30 dans le mois (60 000 FCFA présentiel, 45 000 FCFA distance). Le premier live est réservé en ligne, les 3 suivants sont planifiés avec l'équipe.

Business Day (6h) a été remplacé par le Pack Mensuel, demandé par Bovann.

Tous les lives sont diffusés sur le compte House of Challenge : l'afficher à l'accueil, dans le récapitulatif et dans la confirmation.

Ces tarifs sont provisoires.

L'administrateur doit pouvoir modifier :

- Les prix.
- Les durées.
- Les descriptions.
- Les avantages.
- Les conditions.
- Les types de participation.
- Les disponibilités.
- Les périodes promotionnelles.

Un package désactivé ne doit plus être proposé aux nouveaux clients, mais doit rester consultable dans l'historique des anciennes réservations.

2.4 Calendrier

Créer un calendrier dynamique.

Les disponibilités doivent être calculées à partir des réservations réellement enregistrées.

Ne jamais utiliser un calendrier purement visuel ou des horaires statiques.

Afficher :

- Dates disponibles.
- Dates complètes.
- Créneaux libres.
- Créneaux temporairement retenus.
- Créneaux indisponibles.

Les horaires du studio doivent utiliser Africa/Lome comme référence.

Pour les clients internationaux, afficher leur heure locale et celle de Lomé lorsque cela est nécessaire.

Les durées et les marges de préparation doivent être prises en compte.

---

PARTIE 3 — SYSTÈME DE RÉSERVATION SANS DOUBLE RÉSERVATION

CETTE PARTIE EST CRITIQUE.

Tu dois concevoir un véritable moteur de réservation transactionnel.

L'objectif est de garantir qu'un même créneau et une même ressource ne puissent jamais être attribués à deux clients incompatibles, même lorsque des centaines de demandes arrivent simultanément.

Ne fais pas confiance au navigateur pour gérer la disponibilité.

Ne fais pas confiance à l'agent IA pour garantir un créneau.

La base de données doit être l'autorité finale.

3.1 Architecture de réservation

Utiliser PostgreSQL comme source de vérité.

Mettre en place :

- Transactions SQL.
- Contraintes d'intégrité.
- Verrouillage transactionnel.
- Contraintes d'exclusion sur les intervalles horaires lorsque adaptées.
- Gestion des conflits de concurrence.
- Idempotency keys.
- Expiration automatique des créneaux retenus.
- Vérification serveur avant confirmation.

Pour les réservations utilisant une même ressource, utiliser notamment des intervalles temporels de type tstzrange et une contrainte d'exclusion GiST adaptée.

Ne pas se contenter d'effectuer un SELECT pour vérifier qu'un créneau est libre avant de faire un INSERT : deux transactions concurrentes pourraient toutes les deux voir le créneau libre.

L'opération de vérification et d'attribution doit être atomique.

3.2 Ressources réservables

Modéliser les ressources indépendamment des clients :

- Studio physique de Lomé.
- Régie de production.
- Assistantes disponibles.
- Ressources techniques nécessaires.
- Capacités de sessions simultanées à distance.

Le système doit permettre de définir combien de sessions peuvent fonctionner simultanément selon les ressources disponibles.

Une session à distance ne doit pas bloquer inutilement le studio physique si elle utilise une ressource différente.

En revanche, deux clients ne doivent jamais être affectés à la même assistante au même moment.

3.3 Parcours de réservation sécurisé

Utiliser le processus suivant :

ÉTAPE A — Le client choisit son package et demande un créneau.

ÉTAPE B — Le serveur vérifie la disponibilité réelle.

ÉTAPE C — Le client reçoit une proposition d'horaire.

ÉTAPE D — Le client confirme qu'il souhaite réserver ce créneau.

ÉTAPE E — Le serveur tente atomiquement de verrouiller le créneau.

Si le créneau est déjà pris :

- Refuser immédiatement la réservation.
- Informer le client.
- Rechercher les trois prochains horaires compatibles.
- Présenter les alternatives.
- Demander au client de choisir à nouveau.

Si le créneau est disponible :

- Créer une réservation temporaire.
- Bloquer les ressources nécessaires.
- Définir une expiration, par exemple cinq minutes.
- Associer un identifiant unique à la réservation.

ÉTAPE F — Présenter le récapitulatif final.

ÉTAPE G — Demander une dernière confirmation explicite au client.

ÉTAPE H — Si le client confirme, finaliser la demande et déclencher le paiement selon la politique commerciale.

ÉTAPE I — La réservation devient confirmée uniquement lorsque les conditions de confirmation sont remplies.

Si le paiement est obligatoire, une demande non payée reste en attente de paiement.

Si le paiement échoue ou expire, libérer les ressources automatiquement.

Le mécanisme d'expiration doit fonctionner même en cas de redémarrage du serveur.

Ne pas utiliser uniquement setTimeout ou des timers en mémoire.

Prévoir un traitement périodique des réservations expirées à l'aide d'un worker ou d'une tâche planifiée.

3.4 Protection contre les doubles paiements

Les paiements doivent également être idempotents.

Une même réservation ne doit pas pouvoir générer plusieurs encaissements à cause d'un double clic, d'une répétition réseau ou d'un webhook reçu plusieurs fois.

Vérifier les signatures des webhooks du prestataire.

Ne jamais considérer une redirection du navigateur comme preuve suffisante de paiement.

3.5 Tests de concurrence obligatoires

Construire un test automatisé avec au moins 100 requêtes concurrentes essayant de réserver exactement la même ressource et le même créneau.

Résultat attendu :

- Une seule réservation active peut obtenir ce créneau.
- Toutes les autres reçoivent un conflit contrôlé.
- Aucune double réservation n'est possible.
- Aucune réservation ne reste dans un état incohérent.
- Les journaux permettent d'identifier les conflits.

Réaliser aussi des tests avec plusieurs ressources distinctes pour vérifier que les réservations compatibles peuvent être effectuées simultanément.

---

PARTIE 4 — RÉCEPTIONNISTE IA VOCAL FACULTATIF

Cette fonctionnalité est essentielle, mais elle doit rester optionnelle.

L'utilisateur peut effectuer toute sa réservation manuellement ou utiliser l'agent vocal.

Les deux parcours doivent fonctionner indépendamment et partager le même backend.

4.1 Présentation

Afficher :

« Vous préférez parler plutôt que remplir un formulaire ? »

Bouton :
« Parler à notre réceptionniste IA ».

L'utilisateur autorise son microphone avant le début de la conversation.

Afficher un indicateur visuel permanent lorsque le microphone est actif.

Prévoir :

- Démarrer.
- Couper le microphone.
- Reprendre la conversation.
- Terminer.
- Passer au formulaire.
- Demander un humain.

4.2 Personnalité de l'agent

L'agent doit être une réceptionniste professionnelle, naturelle, accueillante et commerciale.

Il doit parler comme une vraie personne travaillant à l'accueil d'une entreprise.

Sa conversation doit être fluide, humaine et mature.

Il ne doit jamais parler comme un robot qui lit des questions successives.

Il doit :

- Écouter attentivement.
- Comprendre les réponses naturelles.
- Réagir au contexte.
- Poser une seule question utile à la fois.
- Éviter les répétitions.
- Comprendre les hésitations.
- Accepter les corrections.
- Ne pas interrompre inutilement le client.
- Gérer les interruptions et les changements d'avis.

4.3 RÈGLE ABSOLUE : CONFIRMATION SYSTÉMATIQUE DES INFORMATIONS

L'agent doit toujours vérifier qu'il a correctement compris les informations importantes fournies par le client.

Il ne doit jamais transformer une réponse ambiguë en information certaine.

Après chaque information essentielle, il doit reformuler et demander confirmation.

Exemple :

Client :
« Je suis au Cameroun. »

Agent :
« D'accord, vous êtes donc au Cameroun. C'est bien cela ? »

Client :
« Oui. »

Agent :
« Très bien. Et dans quelle ville exercez-vous votre activité ? »

Client :
« Douala. »

Agent :
« Vous êtes donc basé à Douala. Parfait. »

Autre exemple :

Client :
« Je vends des chaussures pour femmes. »

Agent :
« Très bien, votre activité principale est donc la vente de chaussures pour femmes, c'est exact ? »

Client :
« Oui, exactement. »

Agent :
« Parfait. »

Cette confirmation doit concerner notamment :

- Nom du client.
- Nom de l'entreprise.
- Secteur d'activité.
- Pays.
- Ville.
- Type de participation.
- Package.
- Durée.
- Date.
- Heure.
- Téléphone.
- Adresse email, lorsqu'elle est fournie.

Ne pas demander une confirmation mécanique après chaque mot ou phrase sans importance.

Il faut confirmer les informations utiles au bon moment, naturellement, sans rendre la conversation pénible.

Si le client corrige une information, l'agent doit remplacer l'ancienne valeur et confirmer la nouvelle.

Une information incertaine doit rester marquée comme non confirmée dans le contexte de conversation.

4.4 Conversation commerciale

L'agent doit être capable de discuter naturellement avec le client.

Il doit comprendre ce que vend la personne avant de recommander un package.

Il doit expliquer les différences entre les offres.

Il peut conseiller un package, mais ne doit jamais imposer un choix.

Il ne doit pas inventer des promotions, des tarifs, des avantages ou des engagements commerciaux.

Toutes les informations doivent provenir de la configuration officielle de l'application.

4.5 Confirmation du créneau

L'agent doit consulter le moteur de réservation.

Exemple :

Client :
« Je voudrais réserver samedi à 10 heures. »

Agent :
« Je vais vérifier le samedi à 10 heures pour vous. »

L'agent appelle le backend.

Si disponible :

« Le samedi à 10 heures est disponible pour votre session de quatre heures. Vous souhaitez bien retenir cet horaire ? »

Client :
« Oui. »

Le backend tente alors de réserver temporairement la ressource.

Si un autre client a obtenu le créneau entre-temps :

« Je suis désolée, ce créneau vient d'être réservé. Je peux vous proposer 14 heures ou d'autres horaires disponibles. »

Ne jamais prétendre qu'un horaire est réservé avant que le backend ait obtenu le verrouillage nécessaire.

4.6 Récapitulatif final obligatoire

À la fin de toute conversation, l'agent doit obligatoirement récapituler l'ensemble des informations.

Exemple :

« Nous arrivons à la fin de votre réservation.

Je récapitule :

Vous êtes Jean Dupont, responsable de Boutique Élégance, spécialisée dans la vente de chaussures à Douala, au Cameroun.

Vous avez choisi un Live à distance.

Votre formule est Remote Business, pour quatre heures.

Votre session est prévue le samedi 5 décembre, de 14 heures à 18 heures, heure de Lomé.

Le montant est de 35 000 FCFA.

Est-ce que toutes ces informations sont exactes et souhaitez-vous confirmer cette réservation ? »

Le client doit répondre explicitement.

Si le client dit non :

- Ne pas confirmer.
- Demander quelle information doit être corrigée.
- Reprendre le récapitulatif après correction.

Si le client confirme :

- Vérifier une dernière fois l'état du créneau côté serveur.
- Vérifier le verrouillage.
- Enregistrer la validation.
- Déclencher la suite du processus de réservation.

Une réservation ne doit jamais être finalisée uniquement parce que l'agent a terminé de parler.

4.7 Architecture vocale

Étudier les options :

- OpenAI Realtime API.
- WebRTC.
- Speech-to-Text + LLM + Text-to-Speech.
- Fournisseurs spécialisés de voix naturelles comme ElevenLabs.

Comparer :

- Qualité française.
- Latence.
- Coût par minute.
- Capacité à gérer les interruptions.
- Disponibilité des langues.
- Fonctionnement sur connexion mobile faible.
- Sécurité.
- Facilité de changement de fournisseur.

Créer une abstraction VoiceProvider.

Les clés API doivent rester côté serveur.

Utiliser des jetons temporaires lorsque le fournisseur le permet.

Ne pas stocker systématiquement les enregistrements audio.

Le fournisseur vocal doit pouvoir être remplacé sans reconstruire le moteur de réservation.

---

PARTIE 5 — ADMINISTRATION

Construire un véritable espace administratif sécurisé.

Il doit comprendre :

1. Tableau de bord.
2. Calendrier.
3. Réservations.
4. Clients.
5. Entreprises.
6. Packages.
7. Paiements.
8. Assistantes.
9. Gestion des ressources.
10. Réceptionniste IA.
11. Notifications.
12. Paramètres.
13. Journaux d'activité.

L'administrateur doit pouvoir :

- Confirmer une demande.
- Refuser une demande.
- Modifier un horaire.
- Reporter un Live.
- Annuler une réservation.
- Bloquer une journée.
- Modifier les tarifs.
- Ajouter un package.
- Désactiver un package.
- Affecter une assistante.
- Gérer les ressources du studio.
- Consulter les paiements.
- Consulter les demandes effectuées par la voix.
- Désactiver temporairement l'agent vocal.

Chaque modification importante doit être historisée.

Prévoir des rôles :

- Super administrateur.
- Administrateur.
- Gestionnaire des réservations.
- Assistante.
- Comptabilité.

Chaque rôle ne doit accéder qu'aux fonctions nécessaires.

---

PARTIE 6 — INFRASTRUCTURE RAILWAY ET CDN

L'application sera hébergée sur Railway.

L'infrastructure doit être pensée pour éviter les saturations et permettre une montée en charge progressive.

6.1 Architecture cible

Prévoir une architecture modulaire :

- Frontend PWA.
- API backend.
- PostgreSQL.
- Redis.
- Worker de tâches.
- Service de notifications.
- Intégration IA vocale.
- Stockage objet externe.
- CDN.

Ne pas imposer inutilement des microservices.

Commencer avec un backend modulaire et des processus séparés lorsque cela apporte un bénéfice réel.

6.2 Railway

Utiliser Railway pour héberger les services applicatifs.

Prévoir :

- Health checks.
- Gestion des variables d'environnement.
- Déploiements reproductibles.
- Migrations contrôlées.
- Gestion des erreurs.
- Logs structurés.
- Surveillance de la consommation CPU et RAM.
- Redémarrage automatique.
- Gestion des workers.
- Mise à l'échelle horizontale lorsque nécessaire.

Les services applicatifs doivent être stateless.

Ne pas conserver les sessions, verrous ou données temporaires uniquement dans la mémoire du processus.

Toutes les instances doivent partager les mêmes données et mécanismes de coordination.

6.3 PostgreSQL

PostgreSQL doit être la source de vérité des réservations.

Activer les sauvegardes disponibles.

Étudier la haute disponibilité et le point-in-time recovery selon les besoins et le budget.

Prévoir également des sauvegardes logiques indépendantes vers un stockage objet externe.

Tester les restaurations.

Ne jamais considérer qu'une sauvegarde est fiable sans avoir testé sa restauration.

6.4 Redis

Utiliser Redis pour :

- Rate limiting.
- Files d'attente.
- Cache des données non critiques.
- Sessions temporaires de l'agent vocal si nécessaire.
- Coordination des workers.
- Notifications.

Redis ne doit pas remplacer PostgreSQL pour garantir l'unicité des réservations.

Un verrou Redis peut aider à coordonner des traitements, mais la protection finale contre les doubles réservations doit être assurée par PostgreSQL.

6.5 CDN

Prévoir Cloudflare comme CDN et couche de protection.

Configurer :

- DNS.
- HTTPS.
- CDN.
- Cache des ressources statiques.
- Compression.
- Optimisation des images.
- Protection contre les requêtes abusives.
- Rate limiting.
- Protection DDoS.
- Cache des fichiers versionnés.

Utiliser Cloudflare R2 ou un stockage S3 compatible pour les fichiers et images lorsque cela est pertinent.

RÈGLE IMPORTANTE :

Ne jamais mettre en cache publiquement :

- Les réservations.
- Les disponibilités.
- Les données personnelles.
- Les paiements.
- Les sessions authentifiées.
- Les réponses de l'agent vocal.

Les endpoints de disponibilité doivent toujours obtenir des informations suffisamment récentes depuis le backend.

Les API privées doivent utiliser des en-têtes de cache adaptés, notamment no-store lorsque nécessaire.

Les assets statiques versionnés peuvent bénéficier d'un cache CDN long.

Ne pas mettre le CDN en cache devant les flux audio WebRTC ou les connexions temps réel de manière incompatible avec leur fonctionnement.

6.6 Prévention de la saturation

Optimiser les ressources :

- Pagination des listes.
- Requêtes SQL indexées.
- Pool de connexions PostgreSQL.
- Cache des données non critiques.
- Traitement asynchrone des emails.
- Traitement asynchrone des notifications.
- Compression des réponses.
- Images optimisées.
- Lazy loading.
- Limitation des requêtes répétitives.
- Limitation des connexions simultanées.
- File d'attente pour les tâches longues.

Ne pas lancer des traitements lourds dans les requêtes HTTP principales.

Prévoir des limites de concurrence pour les appels aux fournisseurs IA.

La PWA doit rester légère et utilisable sur des smartphones Android modestes.

Ne pas télécharger inutilement des ressources volumineuses à chaque visite.

---

PARTIE 7 — NOTIFICATIONS ET COMMUNICATION

Mettre en place :

- Notifications dans l'administration.
- Emails de confirmation.
- Emails de paiement.
- Notifications d'annulation.
- Notifications de report.
- Notifications d'expiration.
- Notifications de nouvelles réservations.

Prévoir WhatsApp via une API officielle comme évolution possible.

Ne pas dépendre de WhatsApp pour le fonctionnement du moteur de réservation.

Chaque notification doit être déclenchée après un événement réel et enregistré.

Contenu obligatoire d'une notification de nouvelle réservation pour l'équipe : qui, quel business, quel jour et quelle heure, et comment la personne participe. Exemple :

« Mireille Ndongo (Boutique Élégance, mode, vêtements et chaussures) a réservé le mardi 1er décembre de 9h00 à 13h00, heure de Lomé. Sera à distance depuis Douala (Cameroun). Assistante 1 l'accompagne. Va présenter : chaussures pour femmes. Package Remote Business · 35 000 FCFA. »

Pour le présentiel : « Viendra au studio OCD de Lomé. »

---

PARTIE 8 — PAIEMENTS

Préparer une architecture extensible.

Étudier les prestataires compatibles avec :

- Togo.
- Côte d'Ivoire.
- Bénin.
- Sénégal.
- Cameroun.
- Ghana.
- Autres pays africains.
- Paiements internationaux.

Prévoir une abstraction PaymentProvider afin de pouvoir changer de prestataire.

Les paiements doivent être associés à un identifiant unique de réservation.

Gérer :

- En attente.
- En cours.
- Réussi.
- Échoué.
- Remboursé.
- Annulé.

Ne jamais simuler une transaction réelle en production.

---

PARTIE 9 — QUALITÉ, TESTS ET SÉCURITÉ

Tester l'ensemble du produit.

Tests fonctionnels :

- Réservation présentielle.
- Réservation à distance.
- Réservation classique.
- Réservation vocale.
- Confirmation systématique par l'agent.
- Modification d'informations.
- Confirmation finale.
- Paiement.
- Annulation.
- Report.

Tests de concurrence :

- 100 utilisateurs sur le même créneau.
- Plusieurs créneaux différents.
- Plusieurs ressources.
- Expiration simultanée des réservations temporaires.
- Répétition des requêtes.
- Webhooks dupliqués.

Tests d'infrastructure :

- Redémarrage du backend.
- Redémarrage des workers.
- Déconnexion Redis.
- Indisponibilité temporaire du fournisseur vocal.
- Connexion Internet faible.
- Déploiement d'une nouvelle version.
- Restauration d'une sauvegarde.

Sécurité :

- Protection contre les injections.
- Validation serveur.
- Contrôle d'accès.
- Gestion des secrets.
- Authentification forte de l'administration.
- Protection des API.
- Journalisation.
- Protection des données personnelles.

Ne jamais affirmer qu'une fonctionnalité est opérationnelle sans l'avoir testée.

---

PARTIE 10 — MÉTHODE DE DÉVELOPPEMENT

Avant toute modification :

1. Inspecter le dépôt existant.
2. Identifier les technologies et composants.
3. Vérifier les éventuelles fonctionnalités déjà développées.
4. Établir un inventaire des fichiers.
5. Identifier les dépendances.
6. Concevoir l'architecture cible.
7. Présenter un plan d'implémentation.

Ne pas remplacer aveuglément du code existant.

Développer par étapes :

PHASE 1 : Identité visuelle et interface mobile.

PHASE 2 : Moteur de réservation PostgreSQL et gestion de concurrence.

PHASE 3 : Packages, clients et administration.

PHASE 4 : Notifications et paiements.

PHASE 5 : Réceptionniste IA vocal.

PHASE 6 : CDN, optimisation et déploiement Railway.

PHASE 7 : Tests de charge, sécurité et production.

Chaque phase doit être testée avant de passer à la suivante.

Fournir :

- Code source propre.
- Schéma de base de données.
- Documentation technique.
- Variables d'environnement documentées.
- Procédure Railway.
- Configuration CDN.
- Tests automatisés.
- Procédure de sauvegarde et restauration.
- Documentation de l'agent vocal.

OBJECTIF FINAL

Livrer OCD LIVE comme une véritable application commerciale africaine, premium, rapide, fiable et évolutive.

Un commerçant doit pouvoir :

- Comprendre le service immédiatement.
- Choisir son mode de participation.
- Choisir son package.
- Sélectionner un créneau réellement disponible.
- Renseigner ses informations manuellement ou par la voix.
- Faire confirmer chacune de ses informations importantes par la réceptionniste IA.
- Entendre le récapitulatif complet.
- Confirmer explicitement sa réservation.
- Payer.
- Recevoir sa confirmation.

L'équipe OCD doit pouvoir gérer toutes les réservations depuis une seule interface.

AUCUNE DOUBLE RÉSERVATION NE DOIT ÊTRE POSSIBLE.

AUCUNE INFORMATION IMPORTANTE NE DOIT ÊTRE CONSIDÉRÉE COMME CERTAINE SANS VALIDATION DU CLIENT.

AUCUNE RÉSERVATION NE DOIT ÊTRE CONFIRMÉE SANS VALIDATION DU BACKEND.

La simplicité pour le commerçant et la fiabilité pour l'organisation sont les deux priorités absolues.