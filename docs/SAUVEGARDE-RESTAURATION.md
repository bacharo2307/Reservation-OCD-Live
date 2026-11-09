# Sauvegardes et restauration

Une sauvegarde n'est fiable que si sa restauration a été testée.

## 1. Sauvegardes Railway

Railway → service PostgreSQL → onglet **Backups** : activer les sauvegardes planifiées (quotidiennes et hebdomadaires). La restauration se fait depuis le même onglet.

## 2. Sauvegarde logique indépendante (recommandée)

Copie quotidienne hors de Railway (Cloudflare R2 ou stockage S3 compatible), depuis un poste ou un service planifié disposant des outils PostgreSQL :

```bash
# Export compressé
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="ocdlive-$(date +%F).dump"

# Envoi vers R2 (AWS CLI configurée avec les clés R2)
aws s3 cp "ocdlive-$(date +%F).dump" "s3://ocdlive-backups/" --endpoint-url "https://<compte>.r2.cloudflarestorage.com"
```

Garder au moins 30 sauvegardes quotidiennes et 12 mensuelles. L'URL publique de la base se trouve dans Railway → PostgreSQL → *Connect* (`DATABASE_PUBLIC_URL`).

## 3. Tester la restauration (une fois par mois)

```bash
createdb ocdlive_restore_test
pg_restore --no-owner --dbname=ocdlive_restore_test "ocdlive-AAAA-MM-JJ.dump"
psql ocdlive_restore_test -c "SELECT count(*) FROM bookings;"
psql ocdlive_restore_test -c "SELECT ref, status, starts_at FROM bookings ORDER BY created_at DESC LIMIT 5;"
dropdb ocdlive_restore_test
```

Vérifier que le nombre de réservations et les dernières références correspondent à la production.

## 4. Restauration en production

1. Mettre le service web en pause (Railway → service → *Settings* → réduire à 0 réplique) pour éviter les écritures.
2. Restaurer depuis l'onglet **Backups** de Railway, ou dans une nouvelle base avec `pg_restore`, puis pointer `DATABASE_URL` dessus.
3. Relancer le service web : `/api/health` doit répondre `ok`.
4. Vérifier les réservations des prochains jours dans l'espace équipe.

## 5. Haute disponibilité

À étudier selon le budget : réplicas PostgreSQL et restauration à un instant précis (PITR). La sauvegarde logique quotidienne reste indispensable dans tous les cas.
