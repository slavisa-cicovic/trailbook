DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'auth_provider') THEN
    CREATE TYPE auth_provider AS ENUM ('local', 'google', 'facebook', 'apple');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_billing_type') THEN
    CREATE TYPE plan_billing_type AS ENUM ('none', 'monthly', 'yearly', 'lifetime');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM ('active', 'expired', 'canceled', 'lifetime');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mail_outbox_status') THEN
    CREATE TYPE mail_outbox_status AS ENUM ('pending', 'sent', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recording_profile') THEN
    CREATE TYPE recording_profile AS ENUM ('walk', 'bike', 'drive', 'boat', 'plane');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waypoint_category') THEN
    CREATE TYPE waypoint_category AS ENUM ('generic', 'departure', 'fuel', 'border', 'port', 'ferry', 'restaurant', 'cafe', 'viewpoint', 'monument', 'beach');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trip_share_status') THEN
    CREATE TYPE trip_share_status AS ENUM ('active', 'revoked');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waypoint_attachment_type') THEN
    CREATE TYPE waypoint_attachment_type AS ENUM ('photo');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  password_hash TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider auth_provider NOT NULL,
  provider_subject TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS external_identities_user_id_idx ON external_identities(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS access_tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS access_tokens_session_id_idx ON access_tokens(session_id);
CREATE INDEX IF NOT EXISTS access_tokens_expires_at_idx ON access_tokens(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx ON email_verification_tokens(user_id);
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_at_idx ON email_verification_tokens(expires_at);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  billing_type plan_billing_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status subscription_status NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  current_period_ends_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx ON subscriptions(plan_id);

CREATE TABLE IF NOT EXISTS mail_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  html_body TEXT NOT NULL,
  status mail_outbox_status NOT NULL DEFAULT 'pending',
  provider TEXT,
  provider_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mail_outbox_user_id_idx ON mail_outbox(user_id);
CREATE INDEX IF NOT EXISTS mail_outbox_status_idx ON mail_outbox(status);

CREATE TABLE IF NOT EXISTS mobile_recording_configs (
  id TEXT PRIMARY KEY,
  config_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_device_id TEXT NOT NULL,
  local_source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recording_profile recording_profile NOT NULL,
  recording_config_json JSONB,
  battery_start_level_percent DOUBLE PRECISION,
  battery_start_state TEXT,
  battery_end_level_percent DOUBLE PRECISION,
  battery_end_state TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE(owner_user_id, local_source_id)
);

ALTER TABLE trips ADD COLUMN IF NOT EXISTS recording_config_json JSONB;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS battery_start_level_percent DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS battery_start_state TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS battery_end_level_percent DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS battery_end_state TEXT;

CREATE INDEX IF NOT EXISTS trips_owner_user_id_idx ON trips(owner_user_id);

CREATE TABLE IF NOT EXISTS trip_segments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  local_source_id TEXT NOT NULL,
  recording_profile recording_profile NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE(trip_id, local_source_id)
);

CREATE INDEX IF NOT EXISTS trip_segments_trip_id_idx ON trip_segments(trip_id);

CREATE TABLE IF NOT EXISTS trip_points (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  segment_id TEXT REFERENCES trip_segments(id) ON DELETE SET NULL,
  local_source_id TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  accuracy DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  UNIQUE(trip_id, local_source_id)
);

CREATE INDEX IF NOT EXISTS trip_points_trip_id_idx ON trip_points(trip_id);
CREATE INDEX IF NOT EXISTS trip_points_segment_id_idx ON trip_points(segment_id);

CREATE TABLE IF NOT EXISTS trip_diagnostics (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  recording_mode TEXT NOT NULL,
  callback_count INTEGER NOT NULL,
  decision_count INTEGER NOT NULL,
  accepted INTEGER NOT NULL,
  accepted_after_long_gap INTEGER NOT NULL,
  foreground_callbacks INTEGER NOT NULL,
  background_callbacks INTEGER NOT NULL,
  foreground_accepted INTEGER NOT NULL,
  background_accepted INTEGER NOT NULL,
  foreground_rejected INTEGER NOT NULL,
  background_rejected INTEGER NOT NULL,
  duplicate_timestamp INTEGER NOT NULL,
  duplicate_coordinates INTEGER NOT NULL,
  session_duplicate_recorded_at INTEGER NOT NULL,
  rejected_by_accuracy INTEGER NOT NULL,
  rejected_by_min_movement INTEGER NOT NULL,
  rejected_by_jump_distance INTEGER NOT NULL,
  rejected_by_implied_speed INTEGER NOT NULL,
  max_callback_gap_ms INTEGER NOT NULL,
  max_recorded_gap_ms INTEGER NOT NULL,
  recent_events_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, device_id)
);

CREATE INDEX IF NOT EXISTS trip_diagnostics_trip_id_idx ON trip_diagnostics(trip_id);
ALTER TABLE trip_diagnostics ADD COLUMN IF NOT EXISTS accepted_after_long_gap INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS waypoints (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  segment_id TEXT REFERENCES trip_segments(id) ON DELETE SET NULL,
  local_source_id TEXT NOT NULL,
  category waypoint_category NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE(trip_id, local_source_id)
);

CREATE INDEX IF NOT EXISTS waypoints_trip_id_idx ON waypoints(trip_id);
CREATE INDEX IF NOT EXISTS waypoints_segment_id_idx ON waypoints(segment_id);

CREATE TABLE IF NOT EXISTS waypoint_attachments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  waypoint_id TEXT NOT NULL REFERENCES waypoints(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_source_id TEXT NOT NULL,
  waypoint_local_source_id TEXT NOT NULL,
  type waypoint_attachment_type NOT NULL,
  mime_type TEXT,
  original_filename TEXT,
  storage_key TEXT,
  file_size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE(trip_id, local_source_id)
);

CREATE INDEX IF NOT EXISTS waypoint_attachments_trip_id_idx ON waypoint_attachments(trip_id);
CREATE INDEX IF NOT EXISTS waypoint_attachments_waypoint_id_idx ON waypoint_attachments(waypoint_id);
CREATE INDEX IF NOT EXISTS waypoint_attachments_owner_user_id_idx ON waypoint_attachments(owner_user_id);

CREATE TABLE IF NOT EXISTS trip_shares (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status trip_share_status NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trip_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS trip_shares_owner_user_id_idx ON trip_shares(owner_user_id);
CREATE INDEX IF NOT EXISTS trip_shares_recipient_user_id_idx ON trip_shares(recipient_user_id);
