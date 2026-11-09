# Contribuer à OCD LIVE

Merci de vouloir améliorer OCD LIVE, le site de réservation des lives commerciaux de la communauté OCD. Ce guide explique comment installer le projet, proposer une modification et la faire accepter.

## Avant de commencer

Lisez dans cet ordre :

1. [README.md](README.md) : ce que fait le site et comment il est organisé.
2. [CLAUDE.md](CLAUDE.md) : le cahier des charges. Ses règles priment sur tout le reste.
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : base de données, moteur de réservation, paiements, réceptionniste IA.
4. [docs/FEUILLE-DE-ROUTE.md](docs/FEUILLE-DE-ROUTE.md) : les chantiers ouverts, dont des sujets pour une première contribution.

### Les règles à ne jamais casser

- **Aucune double réservation.** La protection finale est la contrainte d'exclusion PostgreSQL `bookings_no_overlap`. Ne faites jamais « vérifier puis insérer » : tentez l'écriture et laissez la base refuser les chevauchements.
- **Le serveur décide.** Le navigateur et la réceptionniste IA affichent et proposent ; seuls les appels serveur retiennent, enregistrent ou confirment une réservation.
- **Aucune information non confirmée n'est considérée comme certaine** (réceptionniste IA).
- **Aucun secret dans le code** (clés API, mots de passe, adresses de base de données) et **aucune donnée de client réelle** dans les issues, les captures d'écran ou les journaux.
- **Une fonctionnalité n'est pas terminée sans test.**

## Installer le projet

Prérequis : Node.js 20 ou plus. PostgreSQL est facultatif pour les tests : ils démarrent leur propre base embarquée.

```bash
git clone https://github.com/bacharo2307/Reservation-OCD-Live.git
cd Reservation-OCD-Live
npm install
npm test                    # 23 tests, base PostgreSQL embarquée
```

Pour lancer le site en local, il faut un PostgreSQL :

```bash
cp .env.example .env        # renseigner DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD
npm run migrate
npm run seed:demo           # réservations d'exemple, en local seulement
npm run dev                 # http://localhost:3000 et http://localhost:3000/admin/
```

En local, `PAYMENT_PROVIDER=demo` simule les paiements. La réceptionniste IA demande une clé `GEMINI_API_KEY` (gratuite sur https://aistudio.google.com/apikey) ou `ANTHROPIC_API_KEY` ; sans clé, son bouton n'apparaît pas et le reste du site fonctionne.

## Proposer une modification

1. **Ouvrez une issue** (bug ou idée) ou choisissez-en une existante, et dites que vous la prenez. Pour un changement important, attendez un retour avant de coder.
2. **Forkez** le dépôt et créez une branche : `fix/calendrier-mois-suivant`, `feat/paiement-fedapay`…
3. **Codez avec des tests**, puis vérifiez :
   ```bash
   npm run check   # syntaxe de tous les fichiers JavaScript
   npm test        # tous les tests
   ```
4. **Commits** : en français, à l'impératif, une idée par commit (« Corrige l'affichage des créneaux à distance »).
5. **Ouvrez une pull request vers `main`** et remplissez le modèle : quoi, pourquoi, comment tester, captures pour tout changement visible.
6. Un mainteneur relit et fusionne. Personne ne pousse directement sur `main` : chaque fusion déclenche le déploiement en production.

## Conventions

**Code**
- JavaScript sans framework ni étape de compilation. Serveur en CommonJS (Node.js, Express) ; navigateur en scripts classiques (`public/*.js`).
- Requêtes SQL toujours paramétrées (`$1`, `$2`…), jamais de concaténation.
- Base de données : toute modification de schéma passe par un **nouveau** fichier `migrations/NNN_nom.sql`. Ne modifiez jamais une migration déjà publiée.
- Toute action de l'équipe qui modifie des données est historisée (`audit()`).
- Pas de nouvelle dépendance sans en discuter dans l'issue.

**Textes et interface**
- Textes visibles en français, phrases courtes, sans jargon.
- Heures en heure de Lomé (GMT), montants en FCFA.
- Couleurs et effets : variables CSS en haut de `public/styles.css`, classe `.glass` pour les surfaces en verre. Vérifiez les modes clair et sombre, et un écran de téléphone (390 px).
- Accessibilité : vrais boutons, champs avec `label`, contraste suffisant, animations coupées avec `prefers-reduced-motion`.
- Le logo officiel se dépose dans `public/brand/` ; n'inventez pas de logo.

**Réceptionniste IA** (`src/services/ai/receptionist.js`, fournisseurs Gemini et Claude dans `src/services/ai/providers.js`)
- Les règles de réservation sont imposées dans le code des outils, pas seulement dans les consignes.
- Les tests utilisent un faux modèle (`tests/ai.test.js`) : aucun appel réel à l'API pendant les tests.

## Signaler une faille de sécurité

Ne l'ouvrez pas en issue publique : suivez [SECURITY.md](SECURITY.md).

## Comportement

Ce projet suit une [charte de conduite](CODE_OF_CONDUCT.md). En participant, vous vous engagez à la respecter.
