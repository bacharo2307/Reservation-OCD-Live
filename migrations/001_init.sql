-- OCD LIVE — schéma initial
-- PostgreSQL est la source de vérité des réservations.
-- La contrainte d'exclusion bookings_no_overlap garantit qu'une même ressource
-- (studio, assistante) ne peut jamais être attribuée à deux réservations actives
-- qui se chevauchent, même avec des centaines de requêtes simultanées.

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ressources réservables, indépendantes des clients.
CREATE TABLE resources (
  id         text PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('studio', 'assistant')),
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  sort       int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE packages (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  tagline          text NOT NULL DEFAULT '',
  description      text NOT NULL DEFAULT '',
  perks            jsonb NOT NULL DEFAULT '[]'::jsonb,
  conditions       text NOT NULL DEFAULT '',
  modes            text[] NOT NULL,
  duration_min     int NOT NULL CHECK (duration_min BETWEEN 30 AND 720),
  sessions         int NOT NULL DEFAULT 1 CHECK (sessions BETWEEN 1 AND 31),
  price_presentiel int CHECK (price_presentiel >= 0),
  price_distance   int CHECK (price_distance >= 0),
  is_quote         boolean NOT NULL DEFAULT false,
  badge            text NOT NULL DEFAULT '',
  promo_label      text,
  promo_percent    int CHECK (promo_percent BETWEEN 1 AND 90),
  promo_from       date,
  promo_to         date,
  active           boolean NOT NULL DEFAULT true,
  sort             int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(modes) > 0 AND modes <@ ARRAY['presentiel', 'distance']::text[])
);

CREATE TABLE customers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL UNIQUE,
  name       text NOT NULL,
  email      text,
  company    text,
  sector     text,
  country    text,
  city       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE booking_ref_seq START 1;

CREATE TABLE bookings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref             text UNIQUE,
  status          text NOT NULL CHECK (status IN ('hold', 'pending_payment', 'quote', 'confirmed', 'cancelled', 'expired')),
  mode            text NOT NULL CHECK (mode IN ('presentiel', 'distance')),
  package_id      text NOT NULL REFERENCES packages(id),
  package_name    text NOT NULL,
  duration_min    int NOT NULL,
  sessions        int NOT NULL DEFAULT 1,
  price           int,               -- NULL = sur devis
  currency        text NOT NULL DEFAULT 'XOF',
  is_quote        boolean NOT NULL DEFAULT false,
  resource_id     text NOT NULL REFERENCES resources(id),
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  during          tstzrange NOT NULL, -- [début, fin + marge de préparation)
  customer_id     uuid REFERENCES customers(id),
  contact         jsonb,              -- nom, entreprise, business, produits, pays, ville, téléphone, email
  idempotency_key text UNIQUE,
  expires_at      timestamptz,
  source          text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'voice', 'admin')),
  is_demo         boolean NOT NULL DEFAULT false,
  confirmed_at    timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (resource_id WITH =, during WITH &&)
    WHERE (status IN ('hold', 'pending_payment', 'quote', 'confirmed'))
);
CREATE INDEX bookings_starts_idx ON bookings (starts_at);
CREATE INDEX bookings_expiring_idx ON bookings (expires_at) WHERE status IN ('hold', 'pending_payment');
CREATE INDEX bookings_customer_idx ON bookings (customer_id);

CREATE TABLE payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id      uuid NOT NULL REFERENCES bookings(id),
  provider        text NOT NULL,
  provider_ref    text,
  method          text,
  amount          int NOT NULL CHECK (amount >= 0),
  currency        text NOT NULL DEFAULT 'XOF',
  status          text NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'refunded', 'cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  raw             jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);
-- Un seul encaissement réussi et un seul paiement ouvert par réservation.
CREATE UNIQUE INDEX payments_one_success ON payments (booking_id) WHERE status = 'succeeded';
CREATE UNIQUE INDEX payments_one_open ON payments (booking_id) WHERE status IN ('pending', 'processing');

-- Déduplication des webhooks reçus plusieurs fois.
CREATE TABLE webhook_events (
  provider    text NOT NULL,
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb,
  PRIMARY KEY (provider, event_id)
);

CREATE TABLE blocked_days (
  day        date PRIMARY KEY,
  reason     text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_created_idx ON notifications (created_at DESC);

-- File de tâches (emails, etc.) traitée par le worker, hors des requêtes HTTP.
CREATE TABLE jobs (
  id         bigserial PRIMARY KEY,
  type       text NOT NULL,
  payload    jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed', 'skipped')),
  attempts   int NOT NULL DEFAULT 0,
  run_after  timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_pending_idx ON jobs (run_after) WHERE status = 'pending';

CREATE TABLE admin_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('super_admin', 'admin', 'booking_manager', 'assistant', 'accounting')),
  password_hash text NOT NULL,
  resource_id   text REFERENCES resources(id),
  active        boolean NOT NULL DEFAULT true,
  failed_logins int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  actor_email text,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  details     jsonb,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_log (created_at DESC);
