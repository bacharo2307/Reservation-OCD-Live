# Cloudflare devant Railway

## DNS et HTTPS

1. Ajouter le domaine dans Cloudflare.
2. Railway → service web → *Networking* → **Custom Domain** → saisir `ocdlive.<domaine>` ; Railway affiche une cible CNAME.
3. Cloudflare → DNS → `CNAME ocdlive → <cible Railway>`, **proxy activé** (nuage orange).
4. SSL/TLS → mode **Full (strict)** ; activer **Always Use HTTPS** et **HSTS**.
5. Variable Railway `TRUST_PROXY=2` (Cloudflare + proxy Railway).

## Cache

Le serveur envoie déjà les bons en-têtes. Règles à créer (*Caching → Cache Rules*), dans cet ordre :

| Correspondance | Action |
| --- | --- |
| Chemin commence par `/api/` | **Bypass cache** |
| Chemin commence par `/admin` | **Bypass cache** |
| Chemin = `/sw.js` | **Bypass cache** |
| URL contient `?v=` | Cache, respecter l'en-tête d'origine (1 an, `immutable`) |
| `/icons/*`, `/manifest.webmanifest` | Cache, TTL bord 1 jour |

Ne jamais mettre en cache : réservations, disponibilités, données personnelles, paiements, sessions. Les pages HTML sont servies en `no-cache` et se mettent à jour à chaque déploiement.

## Performance

- *Speed* → **Brotli** activé ; *Auto Minify* inutile (fichiers déjà petits).
- Images : ajouter de futures photos dans Cloudflare R2 (ou S3 compatible) et utiliser *Polish* / *Image Resizing* si le plan le permet.

## Protection

- *Security* → **Bot Fight Mode** activé, niveau de sécurité « Medium ».
- *Security → WAF → Rate limiting rules* :
  - `POST /api/holds` : 30 requêtes / minute / IP → bloquer 10 min.
  - `POST /api/admin/login` : 10 requêtes / 15 min / IP → challenge.
- Protection DDoS : incluse et active par défaut.
- Les webhooks de paiement (`/api/webhooks/payments/*`) doivent rester accessibles : exclure ce chemin des challenges.
