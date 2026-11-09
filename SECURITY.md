# Sécurité

OCD LIVE traite des réservations, des coordonnées de commerçants et des paiements. Merci de nous aider à le garder sûr.

## Signaler une faille

**N'ouvrez pas d'issue publique.** Utilisez le signalement privé de GitHub : onglet **Security** du dépôt → **Report a vulnerability**. Si ce bouton n'est pas disponible, contactez directement un mainteneur du dépôt en privé.

Indiquez :
- ce que la faille permet (par exemple réserver deux fois le même créneau, lire les données d'un autre client, contourner la connexion de l'équipe) ;
- comment la reproduire, étape par étape ;
- la version concernée (commit) ou l'adresse testée.

Nous accusons réception sous 72 heures et vous tenons informé jusqu'à la correction. Merci de ne pas divulguer la faille avant sa correction.

## Ce qui est concerné

- Le moteur de réservation (doubles réservations, retenues de créneau, expirations).
- Les paiements (double encaissement, webhooks, montants).
- L'espace équipe (connexion, rôles, sessions, protection CSRF).
- La réceptionniste IA (contournement des règles de confirmation, fuite d'informations).
- Les données personnelles des clients.

## Ce qu'il ne faut pas faire

- Tester sur le site de production avec de vraies données de clients ou de vrais paiements : utilisez une installation locale (`npm run dev`).
- Lancer des tests de charge ou de déni de service contre la production.
- Accéder à des données qui ne vous appartiennent pas au-delà du strict nécessaire pour démontrer la faille.
