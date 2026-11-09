-- Réceptionniste IA : sessions de conversation (texte uniquement, aucun enregistrement audio).
-- Les sessions sont supprimées par le worker 24 heures après leur dernière activité.

CREATE TABLE ai_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  messages    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- historique envoyé au modèle (ajout seulement)
  transcript  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- ce que voit le client
  state       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- fiche, réservation en cours, étapes franchies
  turns       int NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  busy_until  timestamptz,                          -- un seul message traité à la fois par session
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_sessions_updated_idx ON ai_sessions (updated_at);

-- La réceptionniste est proposée dès qu'une clé API est configurée (désactivable dans l'espace équipe).
UPDATE settings SET value = jsonb_set(value, '{enabled}', 'true') WHERE key = 'voice';
