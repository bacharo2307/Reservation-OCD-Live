-- Données de référence : réglages, ressources, packages (prix provisoires, modifiables dans l'espace équipe).

INSERT INTO settings (key, value) VALUES
  ('studio',  '{"openHour": 8, "closeHour": 20, "stepMin": 30, "bufferMin": 30}'),
  ('booking', '{"holdMin": 5, "paymentTimeoutMin": 60, "launchDate": "2026-12-01", "horizonDays": 120}'),
  ('brand',   '{"name": "OCD LIVE", "org": "OCD — Opportunité C''est Dehors", "slogan": "Les opportunités, c''est dehors.", "channel": "House of Challenge", "studio": "Studio OCD de Lomé", "logoUrl": ""}'),
  ('voice',   '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO resources (id, kind, name, sort) VALUES
  ('studio-lome', 'studio',    'Studio OCD de Lomé', 0),
  ('assistant-1', 'assistant', 'Assistante 1', 1),
  ('assistant-2', 'assistant', 'Assistante 2', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO packages (id, name, tagline, perks, modes, duration_min, sessions, price_presentiel, price_distance, is_quote, badge, sort) VALUES
  ('decouverte', 'Découverte', 'Votre premier live au studio',
   '["1h30 de live au studio OCD de Lomé", "Régie et matériel fournis", "Diffusion sur le compte House of Challenge"]',
   ARRAY['presentiel'], 90, 1, 20000, NULL, false, '', 1),
  ('business-plus', 'Business Plus', 'Plus de temps, moins cher par heure',
   '["4h de live au studio OCD de Lomé", "Régie et matériel fournis", "Moins cher par heure que Découverte"]',
   ARRAY['presentiel'], 240, 1, 45000, NULL, false, 'Meilleur prix par heure', 2),
  ('remote-starter', 'Remote Starter', 'Votre premier live depuis chez vous',
   '["1h30 de live depuis votre boutique ou votre maison", "Une assistante OCD vous accompagne en direct", "Diffusion sur le compte House of Challenge"]',
   ARRAY['distance'], 90, 1, NULL, 15000, false, '', 3),
  ('remote-business', 'Remote Business', 'Un long live, où que vous soyez',
   '["4h de live à distance", "Une assistante OCD dédiée pendant tout le live", "Moins cher par heure que Remote Starter"]',
   ARRAY['distance'], 240, 1, NULL, 35000, false, 'Meilleur prix par heure', 4),
  ('visibility-premium', 'Visibility Premium', 'La visibilité maximale avec Bovann',
   '["Bovann publie votre vidéo de présentation sur son compte", "Bovann annonce votre live à sa communauté", "Puis 1h30 de live sur le compte House of Challenge"]',
   ARRAY['presentiel', 'distance'], 90, 1, NULL, NULL, true, 'Visibilité max', 5),
  ('pack-mensuel', 'Pack Mensuel', 'Un live par semaine pendant un mois',
   '["4 lives de 1h30 dans le mois", "Vous réservez ici votre premier live", "Les 3 suivants sont planifiés avec l’équipe OCD"]',
   ARRAY['presentiel', 'distance'], 90, 4, 60000, 45000, false, 'Économique', 6)
ON CONFLICT (id) DO NOTHING;
