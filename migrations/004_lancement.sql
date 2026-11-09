-- Mise en service : secret de l'application gardé en base, réglages métier modifiables dans
-- l'espace équipe, et suppression des données de démonstration.

CREATE TABLE app_secrets (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('contact', '{"whatsapp": "", "teamEmails": []}'),
  ('payment', '{"mobileMoneyNumber": "", "mobileMoneyName": "OCD"}')
ON CONFLICT (key) DO NOTHING;

-- Données de démonstration : supprimées au lancement.
DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE is_demo);
DELETE FROM notifications WHERE booking_id IN (SELECT id FROM bookings WHERE is_demo);
DELETE FROM jobs WHERE payload->>'bookingId' IN (SELECT id::text FROM bookings WHERE is_demo);
DELETE FROM bookings WHERE is_demo;
DELETE FROM customers c WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id);
